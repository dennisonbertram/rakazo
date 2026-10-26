import type { AgentRuntime } from "@rakazo/adapter-kit";
import { AI_DISCLOSURE_VERSION } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { describeTeachSteps } from "./teach-steps.js";

const scope = { userId: "user-1", spaceId: "space-1", botId: "bot-1" };
const model = { provider: "openai", id: "gpt-test", apiKey: "k" };
const steps = ["Click left button at (10, 20).", 'Type "[redacted input]".'];

function fixture(options: { reply?: string; consent?: boolean; throws?: boolean } = {}) {
  const prompts: string[] = [];
  const runtime = {
    run: async function* (request: { prompt: string }) {
      prompts.push(request.prompt);
      if (options.throws) throw new Error("model down");
      yield { type: "done", text: options.reply ?? "[]" };
    },
  } as unknown as AgentRuntime;
  const prisma = {
    aiDataConsent: {
      findUnique: vi.fn(async () =>
        options.consent === false ? null : { version: AI_DISCLOSURE_VERSION },
      ),
    },
    usageRecord: { create: vi.fn(), createMany: vi.fn() },
  };
  return { prompts, deps: { prisma, runtime, resolveModel: async () => model } as never };
}

describe("describeTeachSteps", () => {
  it("returns the model's plain steps and sends only the sanitized steps", async () => {
    const reply = '["Click Export in the CRM toolbar.", "Type \\"[redacted input]\\"."]';
    const { deps, prompts } = fixture({ reply: `Here you go: ${reply}` });
    await expect(describeTeachSteps(deps, { scope, goal: "Export", steps })).resolves.toEqual([
      "Click Export in the CRM toolbar.",
      'Type "[redacted input]".',
    ]);
    expect(prompts[0]).toContain("Click left button at (10, 20).");
    expect(prompts[0]).toContain("[redacted input]");
  });

  it("returns null when the call fails, the answer is not steps, or there is no consent", async () => {
    expect(
      await describeTeachSteps(fixture({ throws: true }).deps, { scope, goal: "x", steps }),
    ).toBeNull();
    expect(
      await describeTeachSteps(fixture({ reply: "no list here" }).deps, {
        scope,
        goal: "x",
        steps,
      }),
    ).toBeNull();
    expect(
      await describeTeachSteps(fixture({ reply: '["a"]', consent: false }).deps, {
        scope,
        goal: "x",
        steps,
      }),
    ).toBeNull();
  });

  it("returns null when no model is configured", async () => {
    const { deps } = fixture({ reply: '["a"]' });
    expect(
      await describeTeachSteps({ ...(deps as object), resolveModel: undefined } as never, {
        scope,
        goal: "x",
        steps,
      }),
    ).toBeNull();
  });
});
