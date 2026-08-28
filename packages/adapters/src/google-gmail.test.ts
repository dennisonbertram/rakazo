import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectNativeMailDump,
  decodeBase64Url,
  extractBodyText,
  GmailNative,
  GoogleAuthBroker,
  gmailSummaryLine,
} from "./google-gmail.js";

afterEach(() => vi.unstubAllGlobals());

const ACTOR = { workspaceId: "w1", userId: "u1" };

function brokerWith(tokens: Record<string, unknown> | null) {
  const secretRow = tokens ? { id: "s1", ciphertext: "ct" } : null;
  const prisma = {
    secret: {
      findFirst: vi.fn().mockResolvedValue(secretRow),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const secrets = {
    load: vi.fn().mockReturnValue(JSON.stringify(tokens ?? {})),
    put: vi.fn().mockResolvedValue({ id: "s2", ciphertext: "ct2" }),
  };
  return new GoogleAuthBroker(prisma as never, secrets as never, "client-id");
}

describe("GoogleAuthBroker", () => {
  it("builds a PKCE offline-consent authorization URL", () => {
    const broker = brokerWith(null);
    const { authorizationUrl, state } = broker.begin(
      ACTOR,
      "http://127.0.0.1:5173/google/oauth/callback",
    );
    const url = new URL(authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
  });

  it("returns a fresh token without refreshing, and refreshes an expired one", async () => {
    const fresh = brokerWith({ access_token: "live", expires_in: 3600, obtainedAt: Date.now() });
    expect(await fresh.accessToken(ACTOR)).toBe("live");

    const stale = brokerWith({
      access_token: "old",
      refresh_token: "refresh",
      expires_in: 3600,
      obtainedAt: Date.now() - 7200_000,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "renewed", expires_in: 3600 })),
    );
    expect(await stale.accessToken(ACTOR)).toBe("renewed");
  });
});

describe("Gmail body extraction", () => {
  it("decodes base64url and finds the text/plain part in nested multiparts", () => {
    const data = Buffer.from("hello plain")
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
    expect(decodeBase64Url(data)).toBe("hello plain");
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: Buffer.from("<b>html</b>").toString("base64") } },
        { mimeType: "multipart/mixed", parts: [{ mimeType: "text/plain", body: { data } }] },
      ],
    };
    expect(extractBodyText(payload)).toBe("hello plain");
  });

  it("falls back to stripped html when no plain part exists", () => {
    const payload = {
      mimeType: "text/html",
      body: { data: Buffer.from("<p>Hi <b>there</b></p>").toString("base64") },
    };
    expect(extractBodyText(payload)).toBe("Hi there");
  });
});

describe("native mail dump", () => {
  it("collects ids across queries, dedupes, hydrates, and reports coverage", async () => {
    const broker = brokerWith({ access_token: "live", expires_in: 3600, obtainedAt: Date.now() });
    const gmail = new GmailNative(broker);
    vi.spyOn(gmail, "list")
      .mockResolvedValueOnce({
        ids: [
          { id: "a", threadId: "t" },
          { id: "b", threadId: "t" },
        ],
      })
      .mockResolvedValueOnce({ ids: [{ id: "a", threadId: "t" }] });
    vi.spyOn(gmail, "metadata").mockImplementation(async (_actor, id) => ({
      id,
      threadId: "t",
      date: "2026-08-23",
      from: "a@x",
      to: "me",
      subject: `s-${id}`,
      snippet: "…",
    }));
    const result = await collectNativeMailDump(gmail, ACTOR, ["q1", "q2"], 100);
    expect(result.records.map((record) => record.id).sort()).toEqual(["a", "b"]);
    expect(result.summaries[0]).toMatchObject({ query: "q1", found: 2 });
    expect(result.cappedTotal).toBe(false);
    expect(
      gmailSummaryLine({
        id: "a",
        threadId: "t",
        date: "d",
        from: "f",
        to: "me",
        subject: "s",
        snippet: "p",
      }),
    ).toContain("id=a");
  });
});
