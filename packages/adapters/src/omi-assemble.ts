import type { ArtifactStore, JobPublisher } from "@rakazo/adapter-kit";
import { omiTranscribeJob } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import { OMI_CONNECTOR_ID } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDataRoomRepos } from "@rakazo/db";
import { createFileDataRoomItem, dataRoomBlobContext } from "./data-room-files.js";
import type { OmiRecord } from "./omi-records.js";
import { muxOggOpus, omiFrameMs, parseRecords, splitRecordings } from "./omi-records.js";

export interface OmiAssembleDeps {
  prisma: PrismaClient;
  artifacts: ArtifactStore;
  jobs: JobPublisher;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** `Recording 29 Oct 09:14`, in UTC. */
export function omiRecordingName(start: Date): string {
  return `Recording ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}`;
}

/**
 * Turns the connection's unassembled uploads into Ogg Opus items in "Omi/Audio", oldest first.
 * Safe to run again: a recording already filed under its external id is skipped.
 * ponytail: recordings are closed at the end of each batch, so a recording that spans two syncs
 * becomes two items; extend the previous one while it is still untranscribed if that matters.
 */
export async function runOmiAssemble(
  deps: OmiAssembleDeps,
  payload: { spaceId: string; userId: string; connectionId: string },
): Promise<void> {
  const actor: Actor = {
    userId: payload.userId,
    spaceId: payload.spaceId,
    email: "",
    isDeploymentOwner: false,
  };
  const { prisma, artifacts } = deps;
  const connection = await prisma.connection.findFirst({
    where: {
      id: payload.connectionId,
      spaceId: actor.spaceId,
      userId: actor.userId,
      connectorId: OMI_CONNECTOR_ID,
    },
    select: { id: true },
  });
  if (!connection) return;
  const uploads = await prisma.omiUpload.findMany({
    where: { connectionId: connection.id, assembledAt: null },
    orderBy: [{ receivedAt: "asc" }, { firstSeq: "asc" }],
  });
  if (uploads.length === 0) return;

  const repo = createDataRoomRepos(prisma);
  const filing = createFileDataRoomItem(deps, repo);
  const ctx = dataRoomBlobContext(actor, "omi.assemble");
  const folderId = await filing.folderAt(actor, null, ["Omi", "Audio"], [], "agent");

  // Uploads with the same codec and clock state make one stream; a change starts a new one, and
  // so does a sequence number that does not move forward (the pendant's counter restarted).
  const runs: (typeof uploads)[] = [];
  for (const upload of uploads) {
    const run = runs[runs.length - 1];
    const first = run?.[0];
    const prev = run?.[run.length - 1];
    if (
      run &&
      first &&
      prev &&
      first.codec === upload.codec &&
      first.rtcValid === upload.rtcValid &&
      upload.firstSeq >= prev.firstSeq + BigInt(prev.recordCount)
    ) {
      run.push(upload);
    } else runs.push([upload]);
  }

  for (const run of runs) {
    const first = run[0] as (typeof uploads)[number];
    const last = run[run.length - 1] as (typeof uploads)[number];
    const frameMs = omiFrameMs(first.codec);
    if (frameMs) {
      const records: OmiRecord[] = [];
      for (const upload of run) {
        records.push(
          ...parseRecords(await artifacts.get(upload.storageKey, ctx), Number(upload.firstSeq)),
        );
      }
      const recordings = splitRecordings(records, { gapSeconds: 120, frameMs });
      const runEnd = Math.max(...recordings.map((r) => r.timestamp + r.durationMs / 1000));
      for (const recording of recordings) {
        // The upload holding the recording's first record names it, so a restarted counter
        // never collides with an older recording of the same sequence number.
        const holder = run.find(
          (u) =>
            Number(u.firstSeq) <= recording.firstSeq &&
            recording.firstSeq < Number(u.firstSeq) + u.recordCount,
        ) as (typeof run)[number];
        const externalId = `omi:${recording.firstSeq}:${holder.sha256.slice(0, 12)}`;
        const exists = await prisma.dataRoomItem.findFirst({
          where: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            sourceConnectionId: connection.id,
            externalId,
          },
          select: { id: true },
        });
        if (exists) continue;
        // Without a valid pendant clock the timestamps only order records: place the newest
        // recording's end at the time of upload and the others relative to it.
        const start = first.rtcValid
          ? new Date(recording.timestamp * 1000)
          : new Date(last.receivedAt.getTime() - (runEnd - recording.timestamp) * 1000);
        const { item, created } = await filing.storeAndFile(actor, {
          content: { bytes: muxOggOpus(recording.frames, { sampleRate: 16000, frameMs }) },
          name: omiRecordingName(start),
          mimeType: "audio/ogg",
          folderId,
          source: "omi",
          sourceConnectionId: connection.id,
          externalId,
          notIndexed: true,
        });
        if (created && item) {
          await deps.jobs.enqueue(
            omiTranscribeJob({ spaceId: actor.spaceId, userId: actor.userId, itemId: item.id }),
          );
        }
      }
    }
    await prisma.omiUpload.updateMany({
      where: { id: { in: run.map((u) => u.id) } },
      data: { assembledAt: new Date() },
    });
    for (const upload of run) await filing.dropBlob(actor, upload.storageKey);
  }
}
