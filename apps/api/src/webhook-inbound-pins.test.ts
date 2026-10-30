import { describe, expect, it, vi } from "vitest";
import { deliverWebhookEvent } from "./webhook-inbound.js";

describe("deliverWebhookEvent with routines on different connections", () => {
  it("sends one turn per connection, each pinned to its own, never one on the bot's", async () => {
    const sendUserMessage = vi.fn(async () => ({ messageId: "m", runId: null, seq: 1 }));
    const routine = (name: string, modelCredentialId: string | null) => ({
      name,
      prompt: `do ${name}`,
      modelProvider: "openai-compatible",
      modelId: "m",
      modelCredentialId,
      thinkingLevel: null,
    });

    await deliverWebhookEvent(
      { events: { sendUserMessage }, jobs: { enqueue: vi.fn() } } as never,
      { bot: { id: "bot-1", spaceId: "s", userId: "u" }, threadId: "t" },
      {
        prompt: "payload",
        routines: [routine("a", "cred-a"), routine("b", "cred-b")],
        source: "webhook",
        idempotencyKey: "evt-1",
      },
    );

    const calls = sendUserMessage.mock.calls as unknown as Array<
      [{ modelPin?: { modelCredentialId?: string }; prompt: string; clientNonce?: string }]
    >;
    expect(calls.map(([input]) => input.modelPin?.modelCredentialId)).toEqual(["cred-a", "cred-b"]);
    expect(calls[0]![0].prompt).toContain("do a");
    expect(calls[0]![0].prompt).not.toContain("do b");
    expect(new Set(calls.map(([input]) => input.clientNonce)).size).toBe(2);
  });
});
