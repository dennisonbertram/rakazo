import { describe, expect, it, vi } from "vitest";
import {
  activityNotificationsEnabled,
  activityPromptSnippet,
  listPendingApprovalNotifications,
  pendingAskIsApproval,
  pendingAskSnippet,
} from "./runs.js";

describe("run activity copy", () => {
  it("presents structured agent messages instead of their internal wake prompt", () => {
    expect(
      activityPromptSnippet({
        trigger: "bot_message",
        prompt: "[bot] A message just arrived from another bot with internal routing data",
        sourceBlocks: [
          {
            kind: "bot_message_received",
            fromBotId: "maya",
            fromBotName: "Maya",
            text: "Please check the release workflow.",
            intent: "request",
          },
        ],
      }),
    ).toBe("Maya asked: Please check the release workflow.");
  });

  it("strips markdown from an agent message", () => {
    const snippet = activityPromptSnippet({
      trigger: "bot_message",
      prompt: "x",
      sourceBlocks: [
        {
          kind: "bot_message_received",
          fromBotId: "maya",
          fromBotName: "Maya",
          text: "## Summary\n**Northwind** renewed: see [the file](https://example.com/a).",
          intent: "result",
        },
      ],
    });
    expect(snippet).toBe("Update from Maya: Summary Northwind renewed: see the file.");
    expect(snippet).not.toMatch(/[*#]/);
  });

  it("fails closed when an agent message has no valid structured source", () => {
    expect(
      activityPromptSnippet({
        trigger: "bot_message",
        prompt: "[bot] private internal routing envelope",
        sourceBlocks: [{ kind: "text", text: "not a peer message" }],
      }),
    ).toBe("Message from another agent");
  });
});

it("never shows a new bot's internal introduction prompt", () => {
  expect(
    activityPromptSnippet({
      trigger: "created",
      prompt: "You were just created. In one reply, say what you understood your role to be",
    }),
  ).toBe("Introduced itself");
});

describe("run activity notification preference", () => {
  it("silences only direct messages", () => {
    expect(activityNotificationsEnabled(null, false)).toBe(false);
    expect(activityNotificationsEnabled("group-1", false)).toBe(true);
  });
});

it("previews the pending question on a held run and skips answered cards", () => {
  const ask = (text: string, status?: "pending" | "answered") => ({
    blocks: [{ kind: "ask", text, status }],
  });
  expect(pendingAskSnippet([ask("Old one", "answered"), ask("Send $1,200 to Acme?")])).toBe(
    "Send $1,200 to Acme?",
  );
  expect(pendingAskSnippet([ask("Done", "answered")])).toBeUndefined();
  expect(pendingAskSnippet([{ blocks: [{ kind: "text", text: "hi" }] }])).toBeUndefined();
});

it("tells a pending approval card from a pending question", () => {
  const card = (extra: object, status?: "answered") => ({
    blocks: [{ kind: "ask", text: "Send $250?", status, ...extra }],
  });
  expect(pendingAskIsApproval([card({ approvalEffectId: "effect-1" })])).toBe(true);
  expect(pendingAskIsApproval([card({})])).toBe(false);
  expect(pendingAskIsApproval([card({ approvalEffectId: "effect-1" }, "answered")])).toBe(false);
});

describe("listPendingApprovalNotifications", () => {
  const actor = { spaceId: "s", userId: "u" } as never;
  const fake = (
    runs: unknown[],
    messages: unknown[],
    notifications: unknown[] = [{ id: "n1", runId: "r1" }],
  ) => {
    const notificationFind = vi.fn(async () => notifications);
    const runFind = vi.fn(async () => runs);
    const prisma = {
      run: { findMany: runFind },
      message: { findMany: vi.fn(async () => messages) },
      notification: { findMany: notificationFind },
    } as never;
    return { prisma, runFind, notificationFind };
  };

  it("looks only at held runs of existing agents, however old the notification", async () => {
    const { prisma, runFind, notificationFind } = fake(
      [{ id: "r1", threadId: "t1" }],
      [
        {
          runId: "r1",
          blocks: [{ kind: "ask", text: "Send?", status: "pending", approvalEffectId: "e1" }],
        },
      ],
    );
    await listPendingApprovalNotifications(prisma, actor);
    expect(runFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "waiting_input", bot: { archivedAt: null } }),
      }),
    );
    const where = (
      notificationFind.mock.calls[0] as unknown as [{ where: Record<string, unknown> }]
    )[0].where;
    expect(where).toMatchObject({ runId: { in: ["r1"] } });
    expect(where).not.toHaveProperty("seenAt");
    expect(where).toMatchObject({ dismissedAt: null });
    expect(where).not.toHaveProperty("createdAt");
  });

  it("matches by run, so a stale approval from another agent in the same group thread stays out", async () => {
    const { prisma, notificationFind } = fake(
      [
        { id: "r1", threadId: "g" },
        { id: "r2", threadId: "g" },
      ],
      [
        { runId: "r1", blocks: [{ kind: "ask", text: "Send?", status: "answered" }] },
        {
          runId: "r2",
          blocks: [{ kind: "ask", text: "Pay?", status: "pending", approvalEffectId: "e2" }],
        },
      ],
    );
    await listPendingApprovalNotifications(prisma, actor);
    const call = notificationFind.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(call[0].where).toMatchObject({ runId: { in: ["r2"] } });
    expect(call[0].where).not.toHaveProperty("threadId");
  });

  it("returns nothing when the card was answered", async () => {
    const { prisma, notificationFind } = fake(
      [{ id: "r1", threadId: "t1" }],
      [{ runId: "r1", blocks: [{ kind: "ask", text: "Send?", status: "answered" }] }],
    );
    expect(await listPendingApprovalNotifications(prisma, actor)).toEqual([]);
    expect(notificationFind).not.toHaveBeenCalled();
  });

  const approval = (runId: string, status?: "answered") => ({
    runId,
    blocks: [{ kind: "ask", text: "Send?", status, approvalEffectId: `e-${runId}` }],
  });

  it("counts one approval per held run, however many it asked before", async () => {
    // The mock returns notifications newest first, as the query orders them.
    const { prisma } = fake(
      [
        { id: "r1", threadId: "t1" },
        { id: "r2", threadId: "t2" },
      ],
      [approval("r1"), approval("r2")],
      [
        { id: "n5", runId: "r1" },
        { id: "n4", runId: "r2" },
        { id: "n3", runId: "r1" },
        { id: "n2", runId: "r1" },
        { id: "n1", runId: "r2" },
      ],
    );
    const result = await listPendingApprovalNotifications(prisma, actor);
    expect(result.map((n) => n.id)).toEqual(["n4", "n5"]);
  });

  it("drops a run whose pending card is a question, not an approval", async () => {
    const { prisma, notificationFind } = fake(
      [{ id: "r1", threadId: "t1" }],
      [{ runId: "r1", blocks: [{ kind: "ask", text: "Which one?", status: "pending" }] }],
    );
    expect(await listPendingApprovalNotifications(prisma, actor)).toEqual([]);
    expect(notificationFind).not.toHaveBeenCalled();
  });

  it("drops an approval whose card was answered", async () => {
    const { prisma } = fake([{ id: "r1", threadId: "t1" }], [approval("r1", "answered")]);
    expect(await listPendingApprovalNotifications(prisma, actor)).toEqual([]);
  });
});
