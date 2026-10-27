import type { Actor, Bot } from "@rakazo/contracts";
import { inboxAgentSpawnKey, pageAgentColor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { ensureInboxAgent, PREVIOUS_INBOX_AGENT_INSTRUCTIONS } from "./inbox-agent.js";

const actor: Actor = {
  userId: "user-1",
  spaceId: "space-1",
  email: "user-1@rakazo.test",
  isDeploymentOwner: false,
};

describe("ensureInboxAgent", () => {
  it("upgrades an earlier default, leaves edited text and the current text alone", async () => {
    const replaceBotInstructions = vi.fn(async () => undefined);
    const createBot = vi.fn(async () => ({ id: "bot-1" }) as Bot);
    const repos = { createBot, replaceBotInstructions };
    await ensureInboxAgent(repos, actor);
    const current = (createBot.mock.calls[0] as unknown as [Actor, { instructions: string }])[1]
      .instructions;
    const earlier = PREVIOUS_INBOX_AGENT_INSTRUCTIONS[0]!;
    expect(earlier).not.toBe(current);
    const run = async (instructions: string) => {
      createBot.mockResolvedValueOnce({ id: "bot-1", instructions } as Bot);
      return ensureInboxAgent(repos, actor);
    };
    expect((await run(earlier)).instructions).toBe(current);
    expect(replaceBotInstructions).toHaveBeenCalledWith(actor, "bot-1", {
      from: earlier,
      to: current,
    });
    replaceBotInstructions.mockClear();
    await run(`${earlier} Mine.`);
    await run(current);
    expect(replaceBotInstructions).not.toHaveBeenCalled();
  });

  it("creates the bot only through createBot, keyed by the helper and the session actor", async () => {
    const bot = { id: "bot-1" } as Bot;
    const createBot = vi.fn(async () => bot);

    await expect(
      ensureInboxAgent({ createBot, replaceBotInstructions: vi.fn() }, actor),
    ).resolves.toBe(bot);

    expect(createBot).toHaveBeenCalledTimes(1);
    expect(createBot).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        spawnKey: inboxAgentSpawnKey("user-1"),
        name: "Inbox agent",
        title: "",
        description: "Reads your mail, finds what needs a reply and writes replies.",
        notifyOnFinish: true,
      }),
    );
    const input = (createBot.mock.calls[0] as unknown as [Actor, Record<string, unknown>])[1];
    expect(input).not.toHaveProperty("disabledBuiltinTools");
    expect(input.color).toBe(pageAgentColor("inbox"));
    // A reply goes out through mail_send, which the user approves on a card before it is sent.
    expect(String(input.instructions)).toContain("call mail_send");
    expect(String(input.instructions)).toContain("approves, edits or discards it");
    expect(String(input.instructions)).not.toContain("not send");
    // A reply keeps the message's Cc, counts match the Inbox, and times are never shown in UTC.
    expect(String(input.instructions)).toContain("every other To and Cc recipient");
    expect(String(input.instructions)).toContain("say how many more there are");
    expect(String(input.instructions)).toContain('first sentence is "I could not read');
    expect(String(input.instructions)).toContain("never quote a clock time");
  });
});
