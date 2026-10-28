import type { AdapterContext } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { personCalendarMeetings } from "./calendar-person.js";

const context = {
  operationId: "op",
  traceId: "op",
  spaceId: "s",
  userId: "u",
  signal: new AbortController().signal,
} as AdapterContext;
const accounts = [
  { id: "a", connectorId: "google", accountRef: "ref-a", label: "Work" },
  { id: "b", connectorId: "google", accountRef: "ref-b", label: "Personal" },
];

describe("personCalendarMeetings", () => {
  it("keeps events that list the address and skips a failing account", async () => {
    const google = {
      request: vi.fn(async ({ account }: { account: { providerRef: string } }) => {
        if (account.providerRef === "ref-b") throw new Error("down");
        return {
          status: 200,
          data: {
            items: [
              {
                summary: "Intro call",
                start: { dateTime: "2026-01-02T10:00:00Z" },
                attendees: [{ email: "Kevin@Acme.example.test" }],
                htmlLink: "https://cal.example.test/1",
              },
              { summary: "Other", start: { dateTime: "2026-01-03T10:00:00Z" }, attendees: [] },
              {
                summary: "Cancelled",
                status: "cancelled",
                start: { dateTime: "2026-01-04T10:00:00Z" },
                attendees: [{ email: "kevin@acme.example.test" }],
              },
            ],
          },
        };
      }),
    };
    const meetings = await personCalendarMeetings(
      {
        connectors: { managed: () => ({ proxy: async () => ({}) }) as never },
        google: google as never,
      },
      accounts,
      context,
      "kevin@acme.example.test",
    );
    expect(meetings).toEqual([
      {
        title: "Intro call",
        start: "2026-01-02T10:00:00.000Z",
        href: "https://cal.example.test/1",
      },
    ]);
    expect((google.request.mock.calls[0]?.[0] as unknown as { url: string }).url).toContain("q=kevin%40acme.example.test");
  });
});
