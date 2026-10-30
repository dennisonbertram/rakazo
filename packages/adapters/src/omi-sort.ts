import type {
  AdapterContext,
  AgentRuntime,
  ArtifactStore,
  JobPublisher,
} from "@rakazo/adapter-kit";
import { dataRoomBlobDeleteJob, meetingsDigestJob } from "@rakazo/adapter-kit";
import type { Actor, OmiSegmentDto } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDataRoomRepos, IsolationError, recordUsage } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import {
  createFileDataRoomItem,
  dataRoomBlobContext,
  dataRoomSafeName,
} from "./data-room-files.js";
import type { DataRoomAi } from "./data-room-models.js";
import { LlmDataRoomClassifier } from "./llm-data-room-classifier.js";
import { oggSeconds } from "./omi-segments.js";
import type { OmiKind, OmiStretch } from "./omi-sort-split.js";
import { fallbackStretch, normalizeStretches, parseOmiTranscript } from "./omi-sort-split.js";

export interface OmiSortDeps {
  prisma: PrismaClient;
  artifacts: ArtifactStore;
  jobs: JobPublisher;
  runtime: AgentRuntime;
  resolveAi: (scope: { userId: string; spaceId: string }) => Promise<DataRoomAi>;
}

/** Failed model calls after which the recording is sorted without the model. */
const MAX_FAILURES = 3;
const NOTE_BLOB_DELAY_MS = 60_000;

const actorOf = (p: { spaceId: string; userId: string }): Actor => ({
  ...p,
  email: "",
  isDeploymentOwner: false,
});
const meetingKey = (audioItemId: string, start: number) => `${audioItemId}:${start}`;
const noteKey = (audioItemId: string, start: number) => `omi-note:${audioItemId}:${start}`;

type Lines = ReturnType<typeof parseOmiTranscript>;
const rangeText = (lines: Lines, start: number, end: number) =>
  lines
    .filter((l) => l.at >= start && l.at < end)
    .map((l) => l.text)
    .join("\n\n");

interface Recording {
  id: string;
  name: string;
  connectionId: string;
  startedAt: Date;
  lines: Lines;
}

/** Files the note's text in Omi/Notes; a repeat returns the item already filed. */
async function ensureNote(
  deps: Pick<OmiSortDeps, "prisma" | "artifacts" | "jobs">,
  actor: Actor,
  rec: Recording,
  s: OmiStretch,
): Promise<string> {
  const filing = createFileDataRoomItem(deps, createDataRoomRepos(deps.prisma));
  const folderId = await filing.folderAt(actor, null, ["Omi", "Notes"], [], "agent");
  const { item } = await filing.storeAndFile(actor, {
    content: { bytes: new TextEncoder().encode(rangeText(rec.lines, s.start, s.end)) },
    name: dataRoomSafeName(s.title, "Note"),
    mimeType: "text/markdown",
    folderId,
    source: "omi",
    sourceConnectionId: rec.connectionId,
    externalId: noteKey(rec.id, s.start),
    sourceUpdatedAt: new Date(),
  });
  return (item as { id: string }).id;
}

/** Removes note items (rows now, blobs by queued job) that no segment points to any more. */
async function dropNotes(
  deps: Pick<OmiSortDeps, "prisma" | "jobs">,
  actor: Actor,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const owner = { spaceId: actor.spaceId, userId: actor.userId, id: { in: ids } };
  const items = await deps.prisma.dataRoomItem.findMany({
    where: owner,
    select: { storageKey: true, thumbnailKey: true },
  });
  for (const { storageKey, thumbnailKey } of items) {
    for (const key of [storageKey, thumbnailKey]) {
      if (key) {
        const at = new Date(Date.now() + NOTE_BLOB_DELAY_MS);
        await deps.jobs.enqueue(dataRoomBlobDeleteJob(actor.spaceId, key, at));
      }
    }
  }
  await deps.prisma.dataRoomItem.deleteMany({ where: owner });
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Creates or refreshes the meeting row of a stretch; null when the user deleted it for good. */
async function upsertOmiMeeting(
  tx: Tx,
  actor: Actor,
  rec: Recording,
  s: OmiStretch,
  honorTombstone: boolean,
): Promise<string | null> {
  const key = {
    spaceId: actor.spaceId,
    userId: actor.userId,
    provider: "omi",
    externalId: meetingKey(rec.id, s.start),
  };
  const tombstone = { spaceId_userId_provider_externalId: key };
  if (honorTombstone) {
    if (await tx.meetingTombstone.findUnique({ where: tombstone })) return null;
  } else await tx.meetingTombstone.deleteMany({ where: key });
  const data = {
    connectionId: rec.connectionId,
    title: s.title,
    startedAt: new Date(rec.startedAt.getTime() + s.start * 1000),
    endedAt: new Date(rec.startedAt.getTime() + s.end * 1000),
    transcript: rangeText(rec.lines, s.start, s.end),
    transcriptIndexed: true,
    sourceUpdatedAt: new Date(),
  };
  const { id } = await tx.meeting.upsert({
    where: tombstone,
    create: { ...key, ...data, attendees: [], summary: "" },
    update: data,
    select: { id: true },
  });
  return id;
}

const queueDigest = (deps: Pick<OmiSortDeps, "jobs">, actor: Actor, meetingId: string) =>
  deps.jobs.enqueue({
    ...meetingsDigestJob({ spaceId: actor.spaceId, userId: actor.userId, meetingId }),
    keepExisting: true,
  });

async function loadRecording(prisma: PrismaClient, actor: Actor, itemId: string) {
  const item = await prisma.dataRoomItem.findFirst({
    where: {
      id: itemId,
      spaceId: actor.spaceId,
      userId: actor.userId,
      source: "omi",
      sourceConnectionId: { not: null },
      storageKey: { not: null },
    },
    select: {
      name: true,
      storageKey: true,
      sourceConnectionId: true,
      sourceUpdatedAt: true,
      createdAt: true,
      text: { select: { text: true } },
    },
  });
  if (!item?.storageKey || !item.sourceConnectionId || !item.text) return null;
  const rec: Recording = {
    id: itemId,
    name: item.name,
    connectionId: item.sourceConnectionId,
    startedAt: item.sourceUpdatedAt ?? item.createdAt,
    lines: parseOmiTranscript(item.text.text),
  };
  return { rec, text: item.text.text, storageKey: item.storageKey };
}

/**
 * The `omi.sort` job. One tool-less model call splits the transcript into stretches (meeting, note,
 * trash); without AI-data consent, a model, or after three failed calls the recording is one note.
 * The result replaces earlier agent-made segments of the recording but never a stretch the user
 * moved. Never logs transcript text.
 */
export async function runOmiSort(
  deps: OmiSortDeps,
  payload: { spaceId: string; userId: string; itemId: string },
): Promise<void> {
  const { prisma } = deps;
  const actor = actorOf(payload);
  const loaded = await loadRecording(prisma, actor, payload.itemId);
  if (!loaded) return;
  const { rec } = loaded;
  const duration = Math.max(
    1,
    oggSeconds(await deps.artifacts.get(loaded.storageKey, dataRoomBlobContext(actor, "omi.sort"))),
  );

  let stretches: OmiStretch[];
  if (rec.lines.length === 0) {
    stretches = [{ ...fallbackStretch(rec.name, duration)[0], kind: "trash" } as OmiStretch];
  } else {
    const ai = await deps.resolveAi(actor);
    stretches = fallbackStretch(rec.name, duration);
    if (ai.model && ai.allowed) {
      const operationId = `omi.sort:${rec.id}`;
      const context: AdapterContext = {
        operationId,
        traceId: operationId,
        ...actor,
        signal: AbortSignal.timeout(120_000),
      };
      try {
        const split = await new LlmDataRoomClassifier({
          runtime: deps.runtime,
          model: ai.model,
          onUsage: (usage, attribution) => recordUsage(prisma, usage, attribution),
        }).splitRecording({ name: rec.name, duration, transcript: loaded.text }, context);
        stretches = normalizeStretches(split.segments, duration, rec.name);
      } catch (error) {
        getLogger().warn("omi sort model call failed", {
          reason: error instanceof Error ? error.name : "error",
        });
        const owned = { id: rec.id, spaceId: actor.spaceId, userId: actor.userId };
        await prisma.dataRoomItem.updateMany({
          where: owned,
          data: { failures: { increment: 1 } },
        });
        const failed = await prisma.dataRoomItem.findFirst({
          where: owned,
          select: { failures: true },
        });
        if ((failed?.failures ?? 0) < MAX_FAILURES) throw new Error("Sorting failed");
      }
    }
  }
  // A stretch with no words has nothing to keep.
  stretches = stretches.map((s) =>
    s.kind !== "trash" && rec.lines.length > 0 && !rangeText(rec.lines, s.start, s.end)
      ? { ...s, kind: "trash" }
      : s,
  );
  await applyStretches(deps, actor, rec, stretches);
  await prisma.dataRoomItem.updateMany({
    where: { id: rec.id, spaceId: actor.spaceId, userId: actor.userId },
    data: { failures: 0 },
  });
}

async function applyStretches(
  deps: OmiSortDeps,
  actor: Actor,
  rec: Recording,
  stretches: OmiStretch[],
): Promise<void> {
  const { prisma } = deps;
  const owner = { spaceId: actor.spaceId, userId: actor.userId, audioItemId: rec.id };
  const kept = await prisma.omiSegment.findMany({ where: { ...owner, sortedBy: "user" } });
  const fresh = stretches.filter((s) => !kept.some((u) => s.start < u.end && u.start < s.end));
  // Notes are filed first and by a fixed external id, so a retry finds them again.
  const notes = new Map<number, string>();
  for (const s of fresh)
    if (s.kind === "note") notes.set(s.start, await ensureNote(deps, actor, rec, s));

  const queued: string[] = [];
  const staleNotes = await prisma.$transaction(async (tx) => {
    const old = await tx.omiSegment.findMany({ where: { ...owner, sortedBy: "agent" } });
    await tx.omiSegment.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    const rows: { s: OmiStretch; meetingId: string | null }[] = [];
    const meetingIds = new Set<string>();
    for (const s of fresh) {
      const meetingId =
        s.kind === "meeting" ? await upsertOmiMeeting(tx, actor, rec, s, true) : null;
      if (meetingId) meetingIds.add(meetingId);
      rows.push({ s, meetingId });
    }
    // Meetings from the earlier sort that this one no longer makes.
    const gone = old.flatMap((o) =>
      o.meetingId && !meetingIds.has(o.meetingId) ? [o.meetingId] : [],
    );
    await tx.meeting.deleteMany({
      where: { spaceId: actor.spaceId, userId: actor.userId, id: { in: gone } },
    });
    await tx.omiSegment.createMany({
      data: rows.map(({ s, meetingId }) => ({
        ...owner,
        connectionId: rec.connectionId,
        start: s.start,
        end: s.end,
        kind: s.kind,
        title: s.title,
        meetingId,
        noteItemId: notes.get(s.start) ?? null,
        sortedBy: "agent",
      })),
    });
    queued.push(...meetingIds);
    const keep = new Set(notes.values());
    return old.flatMap((o) => (o.noteItemId && !keep.has(o.noteItemId) ? [o.noteItemId] : []));
  });
  await dropNotes(deps, actor, staleNotes);
  for (const id of queued) await queueDigest(deps, actor, id);
}

/** Moves one stretch to another kind, as the user's choice: the old output goes, the new one is made. */
export async function moveOmiSegment(
  deps: Pick<OmiSortDeps, "prisma" | "artifacts" | "jobs">,
  actor: Actor,
  input: { segmentId: string; kind: OmiKind },
): Promise<OmiSegmentDto> {
  const { prisma } = deps;
  const segment = await prisma.omiSegment.findFirst({
    where: { id: input.segmentId, spaceId: actor.spaceId, userId: actor.userId },
  });
  if (!segment) throw new IsolationError();
  const loaded = await loadRecording(prisma, actor, segment.audioItemId);
  if (!loaded) throw new IsolationError();
  const { rec } = loaded;
  const s: OmiStretch = {
    start: segment.start,
    end: segment.end,
    kind: input.kind,
    title: segment.title,
  };
  let noteItemId: string | null = null;
  if (input.kind === "note" && segment.kind !== "note")
    noteItemId = await ensureNote(deps, actor, rec, s);
  else if (input.kind === "note") noteItemId = segment.noteItemId;

  const { updated, meetingId } = await prisma.$transaction(async (tx) => {
    const meetingId =
      input.kind === "meeting" ? await upsertOmiMeeting(tx, actor, rec, s, false) : null;
    if (segment.meetingId && segment.meetingId !== meetingId) {
      await tx.meeting.deleteMany({
        where: { id: segment.meetingId, spaceId: actor.spaceId, userId: actor.userId },
      });
    }
    const updated = await tx.omiSegment.update({
      where: { id: segment.id },
      data: { kind: input.kind, meetingId, noteItemId, sortedBy: "user" },
    });
    return { updated, meetingId };
  });
  if (segment.noteItemId && segment.noteItemId !== noteItemId) {
    await dropNotes(deps, actor, [segment.noteItemId]);
  }
  if (meetingId) await queueDigest(deps, actor, meetingId);
  return segmentDto(updated, rec.startedAt);
}

type SegmentRow = {
  id: string;
  audioItemId: string;
  kind: string;
  title: string;
  start: number;
  end: number;
  sortedBy: string;
  meetingId: string | null;
  noteItemId: string | null;
};

const segmentDto = (row: SegmentRow, recordingStart: Date): OmiSegmentDto => ({
  id: row.id,
  audioItemId: row.audioItemId,
  kind: row.kind as OmiKind,
  title: row.title,
  startedAt: new Date(recordingStart.getTime() + row.start * 1000).toISOString(),
  endedAt: new Date(recordingStart.getTime() + row.end * 1000).toISOString(),
  sortedBy: row.sortedBy as "agent" | "user",
  meetingId: row.meetingId,
  noteItemId: row.noteItemId,
});

/** The caller's segments, newest recording first; `date` (UTC, YYYY-MM-DD) limits to that day. */
export async function listOmiSegments(
  prisma: PrismaClient,
  actor: Actor,
  input: { date?: string },
): Promise<OmiSegmentDto[]> {
  const day = input.date ? new Date(`${input.date}T00:00:00Z`) : null;
  const rows = await prisma.omiSegment.findMany({
    where: {
      spaceId: actor.spaceId,
      userId: actor.userId,
      ...(day
        ? { audioItem: { sourceUpdatedAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) } } }
        : {}),
    },
    include: { audioItem: { select: { sourceUpdatedAt: true, createdAt: true } } },
    orderBy: [{ audioItem: { sourceUpdatedAt: "desc" } }, { start: "desc" }],
    take: 500,
  });
  return rows.map((r) => segmentDto(r, r.audioItem.sourceUpdatedAt ?? r.audioItem.createdAt));
}
