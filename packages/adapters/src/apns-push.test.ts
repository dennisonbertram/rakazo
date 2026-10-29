import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ApnsConfig, ApnsRequest } from "./apns-push.js";
import { ApnsPushProvider, apnsConfigFromEnv, apnsJwt, PushChannel } from "./apns-push.js";
import { ExpoPushProvider } from "./expo-push.js";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config: ApnsConfig = {
  keyId: "KEY1234567",
  teamId: "TEAM123456",
  privateKey: pem,
  bundleId: "test.example.app",
  sandbox: true,
};
const endpoint = { id: "e1", address: "a".repeat(64), sessionId: null };
const envelope = {
  id: "n1",
  title: "Title",
  body: "Body",
  surface: "thread",
  threadId: "t1",
  botId: "b1",
} as never;
const context = {
  operationId: "o",
  traceId: "o",
  spaceId: "sp",
  userId: "u1",
  signal: new AbortController().signal,
};
const prisma = {
  notificationEndpoint: {
    findMany: async () => [{ ...endpoint }],
    findUnique: async () => ({ platform: "apns" }),
  },
} as never;

function provider(responses: Array<{ status: number; body?: string }>, now = () => 1_000_000) {
  const requests: ApnsRequest[] = [];
  const transport = vi.fn(async (request: ApnsRequest) => {
    requests.push(request);
    const next = responses.shift() ?? { status: 200 };
    return { status: next.status, body: next.body ?? "" };
  });
  return { requests, apns: new ApnsPushProvider(prisma, config, { transport, now }) };
}

describe("apns jwt", () => {
  it("is an ES256 token with kid and iss that verifies against the public key", () => {
    const [h, c, s] = apnsJwt(config, 1234).split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1234,
    });
    const signature = Buffer.from(s, "base64url");
    expect(signature.length).toBe(64);
    expect(
      verify(
        "sha256",
        Buffer.from(`${h}.${c}`),
        { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" },
        signature,
      ),
    ).toBe(true);
  });
});

describe("apns config", () => {
  it("is off unless key, team, key id and bundle are set", () => {
    expect(apnsConfigFromEnv({ APNS_KEY_ID: "k" })).toBeUndefined();
    expect(
      apnsConfigFromEnv({
        APNS_KEY_ID: "k",
        APNS_TEAM_ID: "t",
        APNS_PRIVATE_KEY: "line1\\nline2",
        APNS_BUNDLE_ID: "b",
        APNS_SANDBOX: "true",
      }),
    ).toMatchObject({ privateKey: "line1\nline2", sandbox: true });
  });
});

describe("apns provider", () => {
  it("posts the alert to the sandbox host with topic, collapse id and bearer token", async () => {
    const { apns, requests } = provider([{ status: 200 }]);
    expect(await apns.send(envelope, endpoint, context)).toBe("sent");
    const [request] = requests;
    expect(request?.host).toBe("api.sandbox.push.apple.com");
    expect(request?.path).toBe(`/3/device/${endpoint.address}`);
    expect(request?.headers).toMatchObject({
      "apns-topic": "test.example.app",
      "apns-push-type": "alert",
      "apns-collapse-id": "n1",
    });
    expect(request?.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const body = JSON.parse(request?.body ?? "");
    expect(body.aps).toMatchObject({ alert: { title: "Title", body: "Body" }, "thread-id": "t1" });
    expect(body).toMatchObject({
      kind: "notification",
      notificationId: "n1",
      threadId: "t1",
      spaceId: "sp",
    });
  });

  it("reuses the token until it is 50 minutes old", async () => {
    let t = 1_000_000;
    const { apns, requests } = provider([], () => t);
    await apns.send(envelope, endpoint, context);
    t += 49 * 60_000;
    await apns.send(envelope, endpoint, context);
    t += 2 * 60_000;
    await apns.send(envelope, endpoint, context);
    const tokens = requests.map((r) => r.headers.authorization);
    expect(tokens[0]).toBe(tokens[1]);
    expect(tokens[2]).not.toBe(tokens[0]);
  });

  it("reports 410 and a bad device token as gone", async () => {
    const { apns } = provider([
      { status: 410, body: '{"reason":"Unregistered"}' },
      { status: 400, body: '{"reason":"BadDeviceToken"}' },
    ]);
    expect(await apns.send(envelope, endpoint, context)).toBe("endpointGone");
    expect(await apns.send(envelope, endpoint, context)).toBe("endpointGone");
  });

  it("throws on 429 and 5xx so the outbox retries", async () => {
    const { apns } = provider([
      { status: 429, body: '{"reason":"TooManyRequests"}' },
      { status: 503 },
    ]);
    await expect(apns.send(envelope, endpoint, context)).rejects.toThrow("apns push failed (429");
    await expect(apns.send(envelope, endpoint, context)).rejects.toThrow("apns push failed (503");
  });

  it("mints a new token after the provider token is refused", async () => {
    const { apns, requests } = provider([
      { status: 403, body: '{"reason":"ExpiredProviderToken"}' },
    ]);
    await expect(apns.send(envelope, endpoint, context)).rejects.toThrow();
    await apns.send(envelope, endpoint, context);
    expect(requests).toHaveLength(2);
  });
});

describe("push channel", () => {
  const store = (platform: string) =>
    ({
      notificationEndpoint: {
        findMany: async () => [{ ...endpoint, platform }],
        findUnique: async () => ({ platform }),
      },
    }) as never;

  it("keeps APNs endpoints out of delivery, with one warning, when credentials are absent", async () => {
    const channel = new PushChannel(store("apns"), new ExpoPushProvider(store("apns")));
    expect(await channel.endpoints({ userId: "u1", spaceId: "sp" })).toEqual([]);
    expect(await channel.endpoints({ userId: "u1", spaceId: "sp" })).toEqual([]);
  });

  it("sends Expo endpoints to Expo and APNs endpoints to APNs", async () => {
    const expo = {
      send: vi.fn(async () => "sent"),
      describe: () => ({}),
    } as never as ExpoPushProvider;
    const apnsSend = vi.fn(async () => "sent");
    const apns = { send: apnsSend } as never as ApnsPushProvider;
    expect(await new PushChannel(store("apns"), expo, apns).send(envelope, endpoint, context)).toBe(
      "sent",
    );
    expect(apnsSend).toHaveBeenCalledOnce();
    expect(expo.send).not.toHaveBeenCalled();
    await new PushChannel(store("expo"), expo, apns).send(envelope, endpoint, context);
    expect(expo.send).toHaveBeenCalledOnce();
  });
});
