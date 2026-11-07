import type { Bot, DataRoomApiItem } from "@rakazo/contracts";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  botCanReadDataRoom,
  FIRST_BOT_SPAWN_KEY,
  isMailThreadAgentSpawnKey,
} from "@rakazo/contracts";
import { inferAttachmentMimeType } from "@rakazo/core";
import type { SendTarget } from "../components/data-room/SendToAgent";
import type { ArtifactTarget } from "./artifact-open";
import { fetchArtifactBytes } from "./artifact-open";

/** A Data room file waiting in an agent's composer, sent by reference with the next message. */
export type DataRoomRef = Pick<DataRoomApiItem, "id" | "name" | "mimeType"> & { threadKey: string };

/** The agents of the pages a founder files documents for, ahead of the rest: Data room, Legal, Finance, then Chief. */
const PAGE_AGENT_PREFIXES = [
  "data-room-agent:",
  "legal-agent:",
  "finance-agent:",
  FIRST_BOT_SPAWN_KEY,
];
const pageRank = (bot: Bot) => {
  const rank = PAGE_AGENT_PREFIXES.findIndex((prefix) => bot.spawnKey?.startsWith(prefix));
  return rank === -1 ? PAGE_AGENT_PREFIXES.length : rank;
};

/**
 * Agents a file can be sent to: the page agents first, then the rest by recent activity. An agent
 * that belongs to one email thread is not a place to file a document, so it is left out.
 */
export function sendTargets(bots: Bot[]): SendTarget[] {
  return bots
    .filter((bot) => !bot.archivedAt && !isMailThreadAgentSpawnKey(bot.spawnKey))
    .sort((a, b) => pageRank(a) - pageRank(b) || b.updatedAt.localeCompare(a.updatedAt))
    .map(({ id, name, color }) => ({ id, name, color }));
}

/**
 * Files go by reference to an agent that can open the Data room, up to the per-message cap.
 * Every other agent gets the file itself as an ordinary attachment.
 */
export function planSendToAgent(
  bot: Pick<Bot, "spawnKey" | "disabledBuiltinTools">,
  items: DataRoomApiItem[],
): { refs: DataRoomApiItem[]; copies: DataRoomApiItem[] } {
  return botCanReadDataRoom(bot)
    ? { refs: items.slice(0, ATTACHMENT_MAX_COUNT), copies: [] }
    : { refs: [], copies: items };
}

/** Reads each stored file of a message; the names of the ones that could not be read come back as `failed`. */
export async function fetchMessageFiles(
  target: ArtifactTarget,
  blocks: { kind: string; artifactId?: string; name?: string; mimeType?: string }[],
): Promise<{ files: File[]; failed: string[] }> {
  const files: File[] = [];
  const failed: string[] = [];
  for (const block of blocks) {
    if ((block.kind !== "file" && block.kind !== "image") || !block.artifactId) continue;
    const name = block.name ?? "file";
    try {
      const bytes = await fetchArtifactBytes(target, block.artifactId);
      files.push(new File([new Uint8Array(bytes)], name, { type: block.mimeType }));
    } catch {
      failed.push(name);
    }
  }
  return { files, failed };
}

/**
 * Which files fit in a composer that already holds `existingCount` attachments. `skipped` holds the
 * rest with the reason, worded by `describe`.
 */
export function acceptAttachments(
  existingCount: number,
  files: ArrayLike<File>,
  describe: { count: (name: string) => string; size: (name: string) => string },
): { accepted: File[]; skipped: string[] } {
  const accepted: File[] = [];
  const skipped: string[] = [];
  for (const file of Array.from(files)) {
    if (existingCount + accepted.length >= ATTACHMENT_MAX_COUNT)
      skipped.push(describe.count(file.name));
    else if (file.size > ATTACHMENT_MAX_BYTES) skipped.push(describe.size(file.name));
    else if (!inferAttachmentMimeType(file.name, file.type)) skipped.push(file.name);
    else accepted.push(file);
  }
  return { accepted, skipped };
}
