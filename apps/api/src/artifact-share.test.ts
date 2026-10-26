import type { ArtifactStore } from "@rakazo/adapter-kit";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { ShareStore } from "./artifact-share.js";
import { createRateLimiter, mountArtifactShare } from "./artifact-share.js";
import { mountApiRequestBodyLimits } from "./request-body-limit.js";

const TOKEN = "good-token";
const shared = {
  name: "Dashboard.html",
  mimeType: "text/html",
  spaceId: "space-1",
  userId: "user-1",
  storageKey: "key-1",
};

function setup(allow?: (key: string) => boolean) {
  const open = vi.fn(async (token: string) => (token === TOKEN ? shared : null));
  const store: ShareStore = { open };
  const get = vi.fn(async () => new TextEncoder().encode("<h1>hi</h1>"));
  const artifacts = { get } as unknown as ArtifactStore;
  const app = new Hono();
  mountApiRequestBodyLimits(app);
  mountArtifactShare(app, { store, artifacts, allow });
  return { app, open, get };
}
const post = (app: Hono, token: unknown, headers: Record<string, string> = {}) =>
  app.request("/api/share/open", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "content-type": "application/json", ...headers },
  });
const expectHeaders = (res: Response) => {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("set-cookie")).toBeNull();
};

describe("public share endpoint", () => {
  it("returns only the shared artifact, with private headers and no cookie", async () => {
    const { app, open, get } = setup();
    const res = await post(app, TOKEN);
    expect(res.status).toBe(200);
    expectHeaders(res);
    const body = await res.json();
    expect(body).toEqual({
      name: "Dashboard.html",
      mimeType: "text/html",
      contentBase64: Buffer.from("<h1>hi</h1>").toString("base64"),
    });
    expect(open).toHaveBeenCalledWith(TOKEN);
    // The blob is read in the space and for the user the share row names, nothing else.
    expect(get).toHaveBeenCalledWith(
      "key-1",
      expect.objectContaining({ spaceId: "space-1", userId: "user-1" }),
    );
  });

  it("unknown, expired and revoked tokens (all null from the store) give one identical 404", async () => {
    const { app } = setup();
    const responses = await Promise.all([
      post(app, "unknown"),
      post(app, ""),
      app.request("/api/share/open", { method: "POST", body: "not json" }),
    ]);
    const bodies = await Promise.all(responses.map((r) => r.text()));
    for (const res of responses) {
      expect(res.status).toBe(404);
      expectHeaders(res);
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it("ignores the session cookie: the same artifact comes back with or without one", async () => {
    const { app, open } = setup();
    const withCookie = await post(app, TOKEN, { cookie: "better-auth.session_token=other-user" });
    const without = await post(app, TOKEN);
    expect(await withCookie.json()).toEqual(await without.json());
    // The store only ever sees the token.
    expect(open.mock.calls.every((call) => call.length === 1)).toBe(true);
  });

  it("a GET with the token in the URL opens nothing", async () => {
    const { app, open } = setup();
    const res = await app.request(`/api/share/open?token=${TOKEN}`);
    expect(res.status).toBe(404);
    expect(open).not.toHaveBeenCalled();
  });

  it("a storage failure is a 500 that still carries the private headers", async () => {
    const { app, get } = setup();
    get.mockRejectedValueOnce(new Error("disk"));
    const res = await post(app, TOKEN);
    expect(res.status).toBe(500);
    expectHeaders(res);
  });

  it("is rate limited per caller, with the same headers", async () => {
    const { app } = setup(createRateLimiter());
    let last = 200;
    for (let i = 0; i < 40; i++)
      last = (await post(app, "nope", { "x-forwarded-for": "1.2.3.4" })).status;
    expect(last).toBe(429);
    const limited = await post(app, "nope", { "x-forwarded-for": "1.2.3.4" });
    expectHeaders(limited);
    expect((await post(app, TOKEN, { "x-forwarded-for": "5.6.7.8" })).status).toBe(200);
  });
});
