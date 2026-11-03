import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import { meetingsFollowupJob } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDataRoomRepos } from "@rakazo/db";
import { createFileDataRoomItem, dataRoomSafeName } from "./data-room-files.js";
import { MISSING_MODEL_MESSAGE } from "./executor.js";
import { MeetingDigestSchema } from "./meeting-digest.js";
import { resolveSourceAgent, sourcePrompt, startMeetingRun } from "./meeting-handoff.js";

export interface MeetingFollowupDeps {
  prisma: PrismaClient;
  jobs: JobPublisher;
  artifacts: ArtifactStore;
  /** Throws when the agent has no model; the source agent is only woken when this succeeds. */
  resolveModel?: (scope: { userId: string; spaceId: string; botId: string }) => Promise<unknown>;
}

/** A meeting that ended longer ago than this is a synced backlog entry, not news. */
const FRESH_MS = 24 * 3_600_000;

type Meeting = {
  id: string;
  title: string;
  startedAt: Date;
  attendees: unknown;
  summary: string;
  transcript: string | null;
  digest: unknown;
  category: string | null;
  provider: string;
  sourceUpdatedAt: Date;
};

const day = (date: Date) => date.toISOString().slice(0, 10);

/** The file's text: title, one line of facts, the source's summary, the digest, then the transcript. */
function recordingMarkdown(meeting: Meeting, names: string[]): string {
  const digest = MeetingDigestSchema.safeParse(meeting.digest);
  const section = (heading: string, items: string[]) =>
    items.length ? [`## ${heading}`, ...items.map((item) => `- ${item}`), ""] : [];
  const lines = [
    `# ${meeting.title}`,
    "",
    [day(meeting.startedAt), meeting.provider, names.join(", ")].filter(Boolean).join(" | "),
    "",
    ...(meeting.summary.trim() ? [meeting.summary.trim(), ""] : []),
    ...(digest.success
      ? [
          ...section("Decisions", digest.data.decisions),
          ...section(
            "Action items",
            digest.data.commitments.map(
              (c) => `${c.owner}: ${c.text}${c.due ? ` (due ${c.due})` : ""}`,
            ),
          ),
          ...section("Open items", digest.data.followUps),
        ]
      : []),
    ...(meeting.transcript?.trim() ? ["## Transcript", "", meeting.transcript.trim(), ""] : []),
  ];
  return lines.join("\n");
}

/** Attendee display names (or emails) of a stored meeting. */
const attendeeNames = (attendees: unknown): string[] =>
  Array.isArray(attendees)
    ? attendees.flatMap((a: { name?: unknown; email?: unknown } | null) => {
        const label = typeof a?.name === "string" && a.name ? a.name : a?.email;
        return typeof label === "string" && label ? [label] : [];
      })
    : [];

/**
 * The `meetings.followup` job. For a meeting that just ended (within 24 hours) it files one Markdown
 * file in Data room > Recordings, deduped on the meeting id, so a retry returns the same item.
 * Everything is scoped to the meeting's owner. Never logs meeting text.
 */
export async function runMeetingFollowup(
  deps: MeetingFollowupDeps,
  payload: { spaceId: string; userId: string; meetingId: string },
): Promise<void> {
  const owner = { spaceId: payload.spaceId, userId: payload.userId };
  const meeting = await deps.prisma.meeting.findFirst({
    where: { id: payload.meetingId, ...owner, deletedAt: null },
    select: {
      id: true,
      title: true,
      startedAt: true,
      endedAt: true,
      attendees: true,
      summary: true,
      transcript: true,
      digest: true,
      category: true,
      provider: true,
      connectionId: true,
      mcpServerId: true,
      sourceUpdatedAt: true,
    },
  });
  if (!meeting) return;
  if (Date.now() - (meeting.endedAt ?? meeting.startedAt).getTime() > FRESH_MS) return;

  const actor: Actor = { ...owner, email: "", isDeploymentOwner: false };
  const names = attendeeNames(meeting.attendees);
  const filing = createFileDataRoomItem(deps, createDataRoomRepos(deps.prisma));
  // The meeting row stays locked while the note is filed, and every delete path writes the row
  // before it looks for the note. So a delete either finishes first (the meeting is gone and
  // nothing is filed) or finds the filed note. ponytail: an aborted filing can leave a stored blob.
  await deps.prisma.$transaction(
    async (tx) => {
      const live = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "meetings"
        WHERE "id" = ${meeting.id} AND "spaceId" = ${owner.spaceId} AND "userId" = ${owner.userId}
          AND "deletedAt" IS NULL
        FOR UPDATE`;
      if (live.length === 0) return;
      const folderId = await filing.folderAt(actor, null, ["Recordings"], [], "agent");
      await filing.storeAndFile(actor, {
        content: { bytes: new TextEncoder().encode(recordingMarkdown(meeting, names)) },
        name: dataRoomSafeName(`${day(meeting.startedAt)} ${meeting.title}.md`, "Meeting.md"),
        mimeType: "text/markdown",
        folderId,
        source: "meeting",
        externalId: `meeting:${meeting.id}`,
        sourceUpdatedAt: meeting.sourceUpdatedAt,
        docType: "note",
        docDate: meeting.startedAt,
        parties: names,
        tags: ["meeting", meeting.category ?? "other"],
      });
    },
    { timeout: 30_000 },
  );
  await wakeSourceAgent(deps, owner, meeting);
}

/**
 * Step 3: wakes the agent that reads the meeting's source, once per meeting. Skipped without an
 * agent, without a model, when the owner already opened the meeting, when a run is active on the
 * agent's thread, or when the same call was already handled from another source.
 */
async function wakeSourceAgent(
  deps: MeetingFollowupDeps,
  owner: { spaceId: string; userId: string },
  meeting: Meeting & {
    connectionId: string | null;
    mcpServerId: string | null;
    endedAt: Date | null;
  },
) {
  if (!deps.resolveModel) return;
  const item = await deps.prisma.dataRoomItem.findFirst({
    where: { ...owner, source: "meeting", externalId: `meeting:${meeting.id}` },
    select: { id: true },
  });
  if (!item) return;
  const bot = await resolveSourceAgent(deps.prisma, owner, meeting);
  if (!bot) return;
  try {
    await deps.resolveModel({ ...owner, botId: bot.id });
  } catch (error) {
    // Only "no model configured" skips the wake; anything else throws so the job retries.
    if (error instanceof Error && error.message === MISSING_MODEL_MESSAGE) return;
    throw error;
  }
  await startMeetingRun({ prisma: deps.prisma, jobs: deps.jobs }, owner, {
    meeting,
    bot,
    kind: "source",
    prompt: sourcePrompt(meeting, item.id),
    meta: {
      text: "Summarizing your new meeting",
      link: { label: "Recording", href: `/app/data-room?item=${encodeURIComponent(item.id)}` },
    },
  });
}

/** Meetings digested this long ago and still unfiled are retried (the normal job has had its chance). */
const SWEEP_GRACE_MS = 5 * 60_000;
const SWEEP_BATCH = 100;

/**
 * Recovers follow-ups whose enqueue was lost after the digest was stored: fresh meetings with a
 * done digest and no Recordings note. One bounded query across owners; the job's replaceKey makes
 * a repeat harmless. Returns the number queued.
 */
export async function runFollowupSweep(
  deps: { prisma: PrismaClient; jobs: JobPublisher },
  now = new Date(),
): Promise<number> {
  const fresh = new Date(now.getTime() - FRESH_MS);
  const settled = new Date(now.getTime() - SWEEP_GRACE_MS);
  const rows = await deps.prisma.$queryRaw<{ id: string; spaceId: string; userId: string }[]>`
      SELECT m."id", m."spaceId", m."userId" FROM "meetings" m
      WHERE m."digestStatus" = 'done' AND m."deletedAt" IS NULL
        AND COALESCE(m."endedAt", m."startedAt") > ${fresh}
        AND m."updatedAt" < ${settled}
        AND NOT EXISTS (
          SELECT 1 FROM "data_room_items" i
          WHERE i."spaceId" = m."spaceId" AND i."userId" = m."userId"
            AND i."source" = 'meeting' AND i."externalId" = 'meeting:' || m."id")
      ORDER BY m."updatedAt" ASC LIMIT ${SWEEP_BATCH}`;
  for (const row of rows) {
    await deps.jobs.enqueue(
      meetingsFollowupJob({ spaceId: row.spaceId, userId: row.userId, meetingId: row.id }),
    );
  }
  return rows.length;
}
