import { describe, expect, it, vi } from "vitest";
import {
  isSendBlueEnabled,
  parseSendBlueInbound,
  SendBlueMessagingProvider,
} from "./sendblue.js";

const config = {
  apiKeyId: "key-id",
  apiSecret: "secret",
  signingSecret: "signing",
  phoneNumber: "+15550009999",
};

const context = {
  workspaceId: "ws-1",
  userId: "user-1",
  botId: "bot-1",
  runId: "run-1",
  operationId: "op-1",
  traceId: "trace-1",
  signal: new AbortController().signal,
};

function providerReturning(response: Response) {
  const fetchMock = vi.fn(async () => response);
  return { provider: new SendBlueMessagingProvider(config, { fetch: fetchMock }), fetchMock };
}

describe("SendBlueMessagingProvider", () => {
  it("describes itself as a messaging provider", () => {
    const { provider } = providerReturning(Response.json({}));
    expect(provider.describe()).toEqual({
      id: "sendblue",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { direct: true, groups: true },
    });
  });

  it("sends a direct message with auth headers and returns the handle", async () => {
    const { provider, fetchMock } = providerReturning(
      Response.json({ message_handle: "handle-1" }),
    );
    const result = await provider.sendDirect({ to: "+15551234567", body: "hello" }, context);

    expect(result).toEqual({ handle: "handle-1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.sendblue.com/api/send-message");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("sb-api-key-id")).toBe("key-id");
    expect(headers.get("sb-api-secret-key")).toBe("secret");
    expect(JSON.parse(String(init?.body))).toEqual({
      number: "+15551234567",
      from_number: "+15550009999",
      content: "hello",
    });
  });

  it("sends a group message to an existing group only", async () => {
    const { provider, fetchMock } = providerReturning(
      Response.json({ message_handle: "handle-2" }),
    );
    const result = await provider.sendGroup({ groupId: "group-9", body: "hi all" }, context);

    expect(result).toEqual({ handle: "handle-2" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.sendblue.com/api/send-group-message");
    expect(JSON.parse(String(init?.body))).toEqual({
      group_id: "group-9",
      from_number: "+15550009999",
      content: "hi all",
    });
  });

  it("reads group participants", async () => {
    const { provider, fetchMock } = providerReturning(
      Response.json({
        group_id: "group-9",
        group_display_name: "Family",
        participants: ["+15551111111", "+15552222222"],
      }),
    );
    const group = await provider.getGroup("group-9", context);

    expect(group).toEqual({
      id: "group-9",
      name: "Family",
      participants: ["+15551111111", "+15552222222"],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.sendblue.com/api/v2/groups/group-9");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("throws on non-2xx responses", async () => {
    const { provider } = providerReturning(
      new Response(JSON.stringify({ status: "ERROR", message: "Unauthorized" }), {
        status: 401,
      }),
    );
    await expect(provider.sendDirect({ to: "+15551234567", body: "x" }, context)).rejects.toThrow(
      /401/,
    );
  });
});

describe("isSendBlueEnabled", () => {
  it("requires all four env values", () => {
    vi.stubEnv("VITEST", "");
    expect(isSendBlueEnabled(config)).toBe(true);
    expect(isSendBlueEnabled({ ...config, apiKeyId: "" })).toBe(false);
    expect(isSendBlueEnabled({ ...config, apiSecret: "" })).toBe(false);
    expect(isSendBlueEnabled({ ...config, signingSecret: "" })).toBe(false);
    expect(isSendBlueEnabled({ ...config, phoneNumber: "" })).toBe(false);
    vi.unstubAllEnvs();
  });

  it("is disabled under vitest even with full config", () => {
    expect(process.env.VITEST).toBeTruthy();
    expect(isSendBlueEnabled(config)).toBe(false);
  });
});

describe("parseSendBlueInbound", () => {
  const receivePayload = {
    content: "Hello!",
    is_outbound: false,
    status: "RECEIVED",
    message_handle: "99DCC379-DD76-4712-BA65-11EFB33B8CD6",
    from_number: "+19998887777",
    sendblue_number: "+15122164639",
    media_url: "",
    group_id: "",
    participants: ["+19998887777", "+15122164639"],
    group_display_name: null,
  };

  it("normalizes a 1:1 receive event", () => {
    expect(parseSendBlueInbound(receivePayload)).toEqual({
      type: "message",
      handle: "99DCC379-DD76-4712-BA65-11EFB33B8CD6",
      fromNumber: "+19998887777",
      groupId: null,
      groupName: null,
      participants: ["+19998887777", "+15122164639"],
      content: "Hello!",
      mediaUrl: null,
    });
  });

  it("normalizes a group receive event", () => {
    expect(
      parseSendBlueInbound({
        ...receivePayload,
        group_id: "grp-1",
        group_display_name: "Family",
        media_url: "https://cdn.example.com/pic.jpg",
      }),
    ).toEqual({
      type: "message",
      handle: "99DCC379-DD76-4712-BA65-11EFB33B8CD6",
      fromNumber: "+19998887777",
      groupId: "grp-1",
      groupName: "Family",
      participants: ["+19998887777", "+15122164639"],
      content: "Hello!",
      mediaUrl: "https://cdn.example.com/pic.jpg",
    });
  });

  it("normalizes an outbound status event", () => {
    expect(
      parseSendBlueInbound({ ...receivePayload, is_outbound: true, status: "DELIVERED" }),
    ).toEqual({
      type: "status",
      handle: "99DCC379-DD76-4712-BA65-11EFB33B8CD6",
      status: "DELIVERED",
    });
  });

  it("ignores non-message events and malformed payloads", () => {
    expect(parseSendBlueInbound({ event_type: "call_log", call_id: "cs_1" })).toBeNull();
    expect(parseSendBlueInbound(null)).toBeNull();
    expect(parseSendBlueInbound("nope")).toBeNull();
    expect(parseSendBlueInbound({ is_outbound: false })).toBeNull();
  });
});
