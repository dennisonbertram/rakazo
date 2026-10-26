import { ONCE_ROUTINE_CRON } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import { calendarAgenda } from "./calendar-agenda.js";

const scope = { spaceId: "space-1", userId: "user-1" };
const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-08T00:00:00Z") };
const context = {
  operationId: "op",
  traceId: "op",
  ...scope,
  signal: new AbortController().signal,
};
const accountA = { id: "a", connectorId: "google", accountRef: "ref-a", label: "Work" };
const accountB = { id: "b", connectorId: "google", accountRef: "ref-b", label: "Personal" };

function setup(google: (url: string, ref: string) => unknown) {
  const prisma = {
    scratchpadItem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "s1",
          title: "Send deck",
          dueAt: new Date("2026-11-03T10:00:00Z"),
          botId: "bot-1",
          bot: { name: "Chief" },
        },
      ]),
    },
    inboxTodo: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "i1", text: "Sign form", dueOn: new Date("2026-11-02T00:00:00Z") },
        ]),
    },
    routine: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "r1",
          name: "Look at pricing",
          crons: [ONCE_ROUTINE_CRON],
          nextRunAt: new Date("2026-11-04T09:00:00Z"),
          botId: "bot-1",
          bot: { name: "Chief" },
        },
        {
          id: "r2",
          name: "Weekly digest",
          crons: ["0 9 * * 1"],
          nextRunAt: new Date("2026-11-02T09:00:00Z"),
          botId: "bot-2",
          bot: { name: "Scout" },
        },
      ]),
    },
  };
  const request = vi.fn(
    async ({ account, url }: { account: { providerRef: string }; url: string }) => ({
      status: 200,
      data: google(url, account.providerRef),
    }),
  );
  const connectors = { managed: () => ({ proxy: vi.fn() }) } as never;
  return {
    prisma,
    deps: { prisma: prisma as never, connectors, google: { request } as never },
    request,
  };
}

const calendars = {
  items: [
    { id: "primary", selected: true },
    { id: "hidden", selected: false },
  ],
};

describe("calendarAgenda", () => {
  it("merges events, to-dos, check-backs and routines in start order", async () => {
    const { deps } = setup((url) =>
      url.includes("calendarList")
        ? calendars
        : {
            items: [
              {
                id: "e1",
                summary: "Standup",
                start: { dateTime: "2026-11-02T08:00:00-05:00" },
                end: { dateTime: "2026-11-02T08:15:00-05:00" },
                htmlLink: "https://calendar.google.com/e1",
              },
              {
                id: "e2",
                summary: "Holiday",
                start: { date: "2026-11-05" },
                end: { date: "2026-11-06" },
              },
              { id: "e3", status: "cancelled", start: { date: "2026-11-05" } },
              {
                id: "e4",
                summary: "Declined",
                start: { date: "2026-11-05" },
                attendees: [{ self: true, responseStatus: "declined" }],
              },
            ],
          },
    );
    const result = await calendarAgenda(deps, scope, range, { accounts: [accountA], context });
    expect(result.errors).toEqual([]);
    expect(result.googleConnected).toBe(true);
    expect(result.items.map((i) => [i.kind, i.title, i.allDay])).toEqual([
      ["todo", "Sign form", true],
      ["routine", "Weekly digest", false],
      ["event", "Standup", false],
      ["todo", "Send deck", false],
      ["check_back", "Look at pricing", false],
      ["event", "Holiday", true],
    ]);
    const standup = result.items.find((i) => i.title === "Standup");
    expect(standup).toMatchObject({
      start: "2026-11-02T13:00:00.000Z",
      href: "https://calendar.google.com/e1",
      account: "Work",
      botId: null,
    });
    expect(result.items.find((i) => i.title === "Send deck")).toMatchObject({
      botId: "bot-1",
      botName: "Chief",
    });
  });

  it("reads only selected calendars", async () => {
    const { deps, request } = setup((url) =>
      url.includes("calendarList") ? calendars : { items: [] },
    );
    await calendarAgenda(deps, scope, range, { accounts: [accountA], context });
    const urls = request.mock.calls.map(([call]) => call.url);
    expect(urls.some((u) => u.includes("/calendars/primary/events"))).toBe(true);
    expect(urls.some((u) => u.includes("hidden"))).toBe(false);
  });

  it("keeps the other account's events when one account fails", async () => {
    const { deps } = setup((url, ref) => {
      if (ref === "ref-a") throw new Error("boom");
      return url.includes("calendarList")
        ? calendars
        : {
            items: [{ id: "p1", summary: "Dentist", start: { dateTime: "2026-11-06T15:00:00Z" } }],
          };
    });
    const result = await calendarAgenda(deps, scope, range, {
      accounts: [accountA, accountB],
      context,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.account).toBe("Work");
    expect(result.items.some((i) => i.title === "Dentist")).toBe(true);
    expect(result.items.some((i) => i.title === "Send deck")).toBe(true);
  });

  it("still returns bot items with no Google account", async () => {
    const { deps } = setup(() => ({}));
    const result = await calendarAgenda(deps, scope, range, null);
    expect(result.googleConnected).toBe(false);
    expect(result.items.map((i) => i.kind)).not.toContain("event");
    expect(result.items).toHaveLength(4);
  });

  it("scopes every query to the space and user, in range, skipping watches", async () => {
    const { deps, prisma } = setup(() => ({}));
    await calendarAgenda(deps, scope, range, null);
    expect(prisma.scratchpadItem.findMany.mock.calls[0]?.[0].where).toMatchObject({
      ...scope,
      status: { in: ["open", "parked"] },
      dueAt: { gte: range.from, lt: range.to },
    });
    expect(prisma.inboxTodo.findMany.mock.calls[0]?.[0].where).toMatchObject({
      ...scope,
      doneAt: null,
    });
    expect(prisma.routine.findMany.mock.calls[0]?.[0].where).toMatchObject({
      ...scope,
      active: true,
      managedKind: null,
      nextRunAt: { gte: range.from, lt: range.to },
    });
    expect(prisma.routine.findMany.mock.calls[0]?.[0].where.watch).toBeDefined();
  });
});
