import { describe, expect, it, vi } from "vitest";
import { ingestInboundMedia } from "./messaging-media.js";

const publicHost = async () => [{ address: "93.184.216.34", family: 4 }];
const privateHost = async () => [{ address: "10.0.0.5", family: 4 }];

function createDeps() {
  const put = vi.fn(async () => ({ id: "storage-1", hash: "h" }));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "art-1",
    runId: null,
    createdAt: new Date(),
    ...data,
  }));
  return {
    put,
    create,
    deps: {
      prisma: { artifact: { create } },
      artifacts: { put, get: vi.fn(), remove: vi.fn(), describe: vi.fn() },
    } as never,
  };
}

const owner = { spaceId: "ws-1", userId: "user-1", botId: "bot-1" };

describe("ingestInboundMedia", () => {
  it("stores a JPEG under the sender's space and returns an image block", async () => {
    const { deps, put } = createDeps();
    const fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    );
    const result = await ingestInboundMedia(
      deps,
      { url: "https://cdn.example.com/pic.jpg", ...owner },
      { fetch, resolveHostname: publicHost },
    );
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ name: "pic.jpg", mimeType: "image/jpeg" }),
      expect.objectContaining({ spaceId: "ws-1", userId: "user-1", botId: "bot-1" }),
    );
    expect(result?.block).toEqual({
      kind: "image",
      artifactId: "art-1",
      mimeType: "image/jpeg",
      name: "pic.jpg",
    });
  });

  it("returns null for media the attachment pipeline does not accept", async () => {
    const { deps, put } = createDeps();
    const fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        }),
    );
    await expect(
      ingestInboundMedia(
        deps,
        { url: "https://cdn.example.com/clip.mp4", ...owner },
        { fetch, resolveHostname: publicHost },
      ),
    ).resolves.toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses URLs that resolve to private addresses before fetching", async () => {
    const { deps } = createDeps();
    const fetch = vi.fn();
    await expect(
      ingestInboundMedia(
        deps,
        { url: "https://cdn.example.com/pic.jpg", ...owner },
        { fetch, resolveHostname: privateHost },
      ),
    ).rejects.toThrow(/private/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
