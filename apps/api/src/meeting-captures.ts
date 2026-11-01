import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import { meetingsCaptureFinalizeJob, meetingsCaptureTranscribeJob } from "@rakazo/adapter-kit";
import { dataRoomBlobContext, removeCaptureBlob } from "@rakazo/adapters";
import type {
  Actor,
  MeetingCaptureActive,
  MeetingCaptureTrack,
  MeetingRecordingPolicy,
} from "@rakazo/contracts";
import { MEETING_CAPTURE_CHUNK_MAX_BYTES, MeetingCaptureTrackSchema } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { isUniqueViolation } from "@rakazo/db";
import type { Hono } from "hono";
import { cancelBody } from "./http-body.js";
import { readBody } from "./omi.js";

export interface MeetingCaptureDeps {
  prisma: PrismaClient;
  jobs: JobPublisher;
  artifacts: ArtifactStore;
}

const owner = (actor: Actor) => ({ spaceId: actor.spaceId, userId: actor.userId });
const notFound = () => new ORPCError("NOT_FOUND", { message: "Capture not found" });
const sha256Of = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/** Owners and admins only; applies to captures started afterwards. */
export async function setMeetingRecording(
  deps: MeetingCaptureDeps,
  actor: Actor,
  policy: MeetingRecordingPolicy,
): Promise<{ policy: MeetingRecordingPolicy }> {
  const member = await deps.prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: actor.spaceId, userId: actor.userId } },
    select: { role: true },
  });
  if (!member) throw new ORPCError("NOT_FOUND", { message: "Space not found" });
  if (member.role !== "owner" && member.role !== "admin")
    throw new ORPCError("FORBIDDEN", { message: "Only owners and admins can change this" });
  await deps.prisma.space.update({
    where: { id: actor.spaceId },
    data: { meetingRecording: policy },
  });
  return { policy };
}

/** Starts a recording after the space's policy allows it. A repeat with the same clientId returns the first. */
export async function startCapture(
  deps: MeetingCaptureDeps,
  actor: Actor,
  input: {
    clientId: string;
    title?: string;
    engine: "device" | "server";
    tracks: MeetingCaptureTrack[];
    consentConfirmed?: boolean;
  },
): Promise<{ captureId: string }> {
  const { prisma } = deps;
  const existing = await prisma.meetingCapture.findFirst({
    where: { userId: actor.userId, spaceId: actor.spaceId, clientId: input.clientId },
    select: { id: true },
  });
  if (existing) return { captureId: existing.id };

  const space = await prisma.space.findUnique({
    where: { id: actor.spaceId },
    select: { meetingRecording: true },
  });
  if (!space) throw new ORPCError("NOT_FOUND", { message: "Space not found" });
  if (space.meetingRecording === "off")
    throw new ORPCError("FORBIDDEN", { message: "Recording is off in this space" });
  const confirmed = input.consentConfirmed === true;
  if (space.meetingRecording === "confirm" && !confirmed)
    throw new ORPCError("BAD_REQUEST", { message: "Everyone must agree to be recorded" });
  try {
    const capture = await prisma.meetingCapture.create({
      data: {
        ...owner(actor),
        clientId: input.clientId,
        title: input.title?.trim() || null,
        engine: input.engine,
        tracks: [...new Set(input.tracks)],
        // The time of consent is kept whenever the client says everyone agreed.
        consentConfirmedAt: confirmed ? new Date() : null,
      },
      select: { id: true },
    });
    return { captureId: capture.id };
  } catch (error) {
    // A concurrent start with the same clientId won the insert.
    if (!isUniqueViolation(error)) throw error;
    const won = await prisma.meetingCapture.findFirstOrThrow({
      where: { userId: actor.userId, spaceId: actor.spaceId, clientId: input.clientId },
      select: { id: true },
    });
    return { captureId: won.id };
  }
}

/** The caller's own capture that can still take chunks. */
async function openCapture(deps: MeetingCaptureDeps, actor: Actor, captureId: string) {
  const capture = await deps.prisma.meetingCapture.findFirst({
    where: { id: captureId, ...owner(actor) },
  });
  if (!capture || capture.status === "discarded") throw notFound();
  return capture;
}

export async function appendCaptureText(
  deps: MeetingCaptureDeps,
  actor: Actor,
  input: {
    captureId: string;
    track: MeetingCaptureTrack;
    seq: number;
    startMs: number;
    endMs: number;
    text: string;
  },
): Promise<{ ok: true }> {
  const capture = await openCapture(deps, actor, input.captureId);
  if (capture.engine !== "device" || !capture.tracks.includes(input.track))
    throw new ORPCError("BAD_REQUEST", {
      message: "This capture does not take text for this track",
    });
  if (capture.status !== "recording" && capture.status !== "finishing")
    throw new ORPCError("CONFLICT", { message: "Capture is closed" });
  const sha256 = sha256Of(input.text);
  const key = { captureId: capture.id, track: input.track, seq: input.seq };
  const known = await deps.prisma.meetingCaptureChunk.findUnique({
    where: { captureId_track_seq: key },
    select: { sha256: true },
  });
  if (known) {
    if (known.sha256 !== sha256)
      throw new ORPCError("CONFLICT", { message: "Chunk already stored with other content" });
    return { ok: true };
  }
  try {
    await deps.prisma.meetingCaptureChunk.create({
      data: {
        ...owner(actor),
        ...key,
        startMs: input.startMs,
        endMs: input.endMs,
        sha256,
        text: input.text.trim(),
        status: "done",
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { ok: true };
  }
  await deps.prisma.meetingCapture.updateMany({
    where: { id: capture.id, ...owner(actor) },
    data: { lastChunkAt: new Date() },
  });
  return { ok: true };
}

export async function finishCapture(
  deps: MeetingCaptureDeps,
  actor: Actor,
  input: { captureId: string; endedAt: string },
): Promise<{ ok: true }> {
  const capture = await openCapture(deps, actor, input.captureId);
  if (capture.status === "recording") {
    await deps.prisma.meetingCapture.updateMany({
      where: { id: capture.id, ...owner(actor), status: "recording" },
      data: { status: "finishing", endedAt: new Date(input.endedAt) },
    });
  }
  // Safe to repeat: one queued job per capture, and finalizing twice stores one meeting.
  await deps.jobs.enqueue(meetingsCaptureFinalizeJob({ ...owner(actor), captureId: capture.id }));
  return { ok: true };
}

/** Deletes the chunks and their audio. The capture row stays as "discarded" so a retry is a no-op. */
export async function discardCapture(
  deps: MeetingCaptureDeps,
  actor: Actor,
  captureId: string,
): Promise<{ ok: true }> {
  const capture = await deps.prisma.meetingCapture.findFirst({
    where: { id: captureId, ...owner(actor) },
  });
  if (!capture) throw notFound();
  if (capture.status === "discarded") return { ok: true };
  if (capture.status === "done" || capture.status === "failed")
    throw new ORPCError("CONFLICT", { message: "Capture is already stored" });
  await deps.prisma.meetingCapture.updateMany({
    where: { id: capture.id, ...owner(actor) },
    data: { status: "discarded" },
  });
  const chunks = await deps.prisma.meetingCaptureChunk.findMany({
    where: { captureId: capture.id, ...owner(actor) },
    select: { blobKey: true },
  });
  await deps.prisma.meetingCaptureChunk.deleteMany({
    where: { captureId: capture.id, ...owner(actor) },
  });
  for (const { blobKey } of chunks) if (blobKey) await removeCaptureBlob(deps, actor, blobKey);
  return { ok: true };
}

export async function activeCapture(
  deps: MeetingCaptureDeps,
  actor: Actor,
): Promise<MeetingCaptureActive> {
  const capture = await deps.prisma.meetingCapture.findFirst({
    where: { ...owner(actor), status: { in: ["recording", "finishing"] } },
    orderBy: { startedAt: "desc" },
  });
  if (!capture) return null;
  return {
    captureId: capture.id,
    title: capture.title,
    engine: capture.engine as "device" | "server",
    tracks: capture.tracks as MeetingCaptureTrack[],
    status: capture.status as "recording" | "finishing",
    startedAt: capture.startedAt.toISOString(),
  };
}

const intParam = (value: string | undefined) =>
  value !== undefined && /^\d{1,9}$/.test(value) ? Number(value) : null;

/** Session-authenticated raw upload of one audio chunk. */
export function mountMeetingCaptureRoutes(
  app: Hono,
  deps: MeetingCaptureDeps,
  authenticate: (request: Request) => Promise<Actor | null>,
) {
  const { prisma, artifacts, jobs } = deps;
  app.post("/api/meeting-captures/:id/chunks", async (c) => {
    const actor = await authenticate(c.req.raw);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    const reject = (message: string, status: 400 | 404 | 409 | 413) => {
      cancelBody(c.req.raw.body);
      return c.json({ error: message }, status);
    };
    const capture = await prisma.meetingCapture.findFirst({
      where: { id: c.req.param("id"), ...owner(actor) },
    });
    if (!capture || capture.status === "discarded") return reject("Capture not found", 404);
    if (
      capture.engine !== "server" ||
      (capture.status !== "recording" && capture.status !== "finishing")
    )
      return reject("Capture does not take audio", 409);
    const track = MeetingCaptureTrackSchema.safeParse(c.req.query("track"));
    const seq = intParam(c.req.query("seq"));
    const startMs = intParam(c.req.query("startMs"));
    const endMs = intParam(c.req.query("endMs"));
    if (!track.success || !capture.tracks.includes(track.data)) return reject("Invalid track", 400);
    if (seq === null || startMs === null || endMs === null || endMs < startMs)
      return reject("Invalid seq, startMs or endMs", 400);

    const body = await readBody(c.req.raw, MEETING_CAPTURE_CHUNK_MAX_BYTES);
    if (!body) return c.json({ error: "Too large" }, 413);
    if (body.byteLength === 0) return c.json({ error: "Empty chunk" }, 400);

    const key = { captureId: capture.id, track: track.data, seq };
    const sha256 = sha256Of(body);
    // A retry (same position and bytes) answers the same; it queues transcription again in case
    // the first request stored the chunk and died before queueing. The same position with other
    // bytes is a client bug.
    const known = await prisma.meetingCaptureChunk.findUnique({
      where: { captureId_track_seq: key },
      select: { id: true, sha256: true, status: true },
    });
    const queue = (chunkId: string) =>
      jobs.enqueue(meetingsCaptureTranscribeJob({ ...owner(actor), chunkId }));
    if (known) {
      if (known.sha256 !== sha256)
        return c.json({ error: "Chunk already stored with other bytes" }, 409);
      if (known.status === "pending") await queue(known.id);
      return c.json({ stored: true }, 200);
    }

    const context = dataRoomBlobContext(actor, "meeting-capture.upload", c.req.raw.signal);
    const blob = await artifacts.put(
      { name: `capture-${seq}.bin`, mimeType: "application/octet-stream", bytes: body },
      context,
    );
    let chunkId: string;
    try {
      ({ id: chunkId } = await prisma.meetingCaptureChunk.create({
        data: { ...owner(actor), ...key, startMs, endMs, sha256, blobKey: blob.id },
        select: { id: true },
      }));
    } catch (error) {
      await artifacts.remove(blob.id, context).catch(() => undefined);
      // A concurrent identical retry won the insert.
      if (isUniqueViolation(error)) return c.json({ stored: true }, 200);
      throw error;
    }
    await prisma.meetingCapture.updateMany({
      where: { id: capture.id, ...owner(actor) },
      data: { lastChunkAt: new Date() },
    });
    // Discard may have run between the check above and the insert; do not keep that audio.
    const still = await prisma.meetingCapture.findFirst({
      where: { id: capture.id, ...owner(actor) },
      select: { status: true },
    });
    if (still?.status === "discarded") {
      await prisma.meetingCaptureChunk.deleteMany({ where: { id: chunkId, ...owner(actor) } });
      await removeCaptureBlob(deps, actor, blob.id);
      return c.json({ error: "Capture not found" }, 404);
    }
    await queue(chunkId);
    return c.json({ stored: true }, 201);
  });
}
