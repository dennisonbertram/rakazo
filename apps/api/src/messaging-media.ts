import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ArtifactStore } from "@rakazo/adapter-kit";
import { fetchSafeWebBytes, type SafeWebFetchOptions } from "@rakazo/adapters";
import { ATTACHMENT_MAX_BYTES, type MessageBlock } from "@rakazo/contracts";
import { inferAttachmentMimeType, messageBlockForArtifact } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { storeOwnedArtifact } from "./artifacts.js";

const execFileAsync = promisify(execFile);
const FETCH_TIMEOUT_MS = 15_000;
const CONVERT_TIMEOUT_MS = 30_000;

export interface IngestedInboundMedia {
  artifact: { id: string; name: string; mimeType: string; size: number };
  block: Extract<MessageBlock, { kind: "image" | "file" }>;
}

/**
 * Pull an inbound attachment off the provider CDN and store it as an artifact
 * owned by the sender, so image blocks reach the model like a web upload
 * would. The download goes through the SSRF-guarded fetch (public addresses
 * only, pinned DNS, capped body) because the URL is provider-supplied.
 * iPhones send HEIC over iMessage; that is converted to JPEG with libheif's
 * `heif-convert` (sharp's bundled libvips has no HEVC decoder). Returns null
 * for anything the attachment pipeline does not accept (video, audio,
 * oversize) — callers fall back to passing the URL as text.
 */
export async function ingestInboundMedia(
  deps: { prisma: PrismaClient; artifacts: ArtifactStore },
  input: { url: string; spaceId: string; userId: string; botId: string },
  fetchOptions: Pick<SafeWebFetchOptions, "fetch" | "resolveHostname"> = {},
): Promise<IngestedInboundMedia | null> {
  const {
    url,
    bytes: downloaded,
    contentType,
  } = await fetchSafeWebBytes(input.url, {
    ...fetchOptions,
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: ATTACHMENT_MAX_BYTES,
  });
  if (downloaded.byteLength === 0) return null;

  let bytes = downloaded;
  let name = path.posix.basename(new URL(url).pathname) || "attachment";
  const reported = contentType?.split(";")[0]?.trim().toLowerCase();
  let mimeType = inferAttachmentMimeType(name, reported);
  if (!mimeType && isHeic(name, reported)) {
    bytes = await heicToJpeg(bytes);
    if (bytes.byteLength > ATTACHMENT_MAX_BYTES) return null;
    name = `${name.replace(/\.[^.]*$/, "")}.jpg`;
    mimeType = "image/jpeg";
  }
  if (!mimeType) return null;

  const artifact = await storeOwnedArtifact(
    deps,
    { spaceId: input.spaceId, userId: input.userId },
    { botId: input.botId, name, mimeType, bytes },
  );
  return { artifact, block: messageBlockForArtifact(artifact) };
}

function isHeic(name: string, mimeType: string | undefined): boolean {
  return mimeType === "image/heic" || mimeType === "image/heif" || /\.hei[cf]$/i.test(name);
}

async function heicToJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rakazo-heic-"));
  try {
    const source = path.join(dir, "in.heic");
    const target = path.join(dir, "out.jpg");
    await writeFile(source, bytes);
    await execFileAsync("heif-convert", ["-q", "85", source, target], {
      timeout: CONVERT_TIMEOUT_MS,
    });
    return new Uint8Array(await readFile(target));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
