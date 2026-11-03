import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDataRoomRepos } from "@rakazo/db";
import { createFileDataRoomItem, dataRoomSafeName } from "./data-room-files.js";
import { MeetingDigestSchema } from "./meeting-digest.js";

export interface MeetingFollowupDeps {
  prisma: PrismaClient;
  jobs: JobPublisher;
  artifacts: ArtifactStore;
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
      provider: true,
      sourceUpdatedAt: true,
    },
  });
  if (!meeting) return;
  if (Date.now() - (meeting.endedAt ?? meeting.startedAt).getTime() > FRESH_MS) return;

  const actor: Actor = { ...owner, email: "", isDeploymentOwner: false };
  const names = attendeeNames(meeting.attendees);
  const filing = createFileDataRoomItem(deps, createDataRoomRepos(deps.prisma));
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
    tags: ["meeting"],
  });
}
