import { describe, expect, it } from "vitest";
import {
  buildMailDumpFile,
  collectMailDump,
  mailDumpLine,
  toMailDumpRecord,
} from "./mail-dump.js";

const RAW = {
  messageId: "abc123",
  threadId: "t1",
  messageTimestamp: "2026-08-20T10:00:00Z",
  sender: "Alice <alice@acme.com>",
  to: "me@example.com",
  subject: "Invoice  #42\n  overdue",
  preview: { body: "Please pay the   attached invoice soon." },
};

type FakePage = { messages: Record<string, unknown>[]; next?: boolean; error?: string };

function fakeConnector(pages: FakePage[]) {
  let call = 0;
  return {
    async *execute() {
      const page = pages[call] ?? { messages: [] };
      call += 1;
      if (page.error) {
        yield { type: "error" as const, message: page.error };
        return;
      }
      yield {
        type: "result" as const,
        data: { data: { messages: page.messages, nextPageToken: page.next ? `page-${call}` : undefined } },
      };
    },
  };
}

const CONTEXT = { workspaceId: "w", userId: "u", botId: "b", signal: new AbortController().signal } as never;

describe("email dump search", () => {
  it("normalizes raw messages into single-line grep-friendly records", () => {
    const record = toMailDumpRecord(RAW);
    expect(record).toMatchObject({ id: "abc123", subject: "Invoice #42 overdue" });
    const line = mailDumpLine(record!);
    expect(line).toContain("Alice <alice@acme.com>");
    expect(line).toContain("Please pay the attached invoice soon.");
    expect(line).toContain("id=abc123");
    expect(line).not.toContain("\n");
  });

  it("paginates, dedupes across queries, and reports per-query coverage", async () => {
    const connector = fakeConnector([
      { messages: [RAW, { ...RAW, messageId: "def456", subject: "Second" }], next: true },
      { messages: [{ ...RAW, messageId: "ghi789", subject: "Third" }] },
      { messages: [RAW] },
    ]);
    const result = await collectMailDump({
      connector: connector as never,
      context: CONTEXT,
      queries: ["from:acme.com", "subject:invoice"],
      maxMessages: 100,
    });
    expect(result.records.map((r) => r.id).sort()).toEqual(["abc123", "def456", "ghi789"]);
    expect(result.summaries[0]).toMatchObject({ query: "from:acme.com", found: 3, pages: 2 });
    expect(result.summaries[1]).toMatchObject({ found: 1 });
    expect(result.cappedTotal).toBe(false);
  });

  it("caps the total and marks coverage as incomplete", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...RAW, messageId: `m${i}` }));
    const connector = fakeConnector([{ messages: many }]);
    const result = await collectMailDump({
      connector: connector as never,
      context: CONTEXT,
      queries: ["broad"],
      maxMessages: 4,
    });
    expect(result.records).toHaveLength(4);
    expect(result.cappedTotal).toBe(true);
    expect(result.summaries[0]?.capped).toBe(true);
  });

  it("records per-query failures without losing other queries", async () => {
    const connector = fakeConnector([{ messages: [], error: "rate limited" }, { messages: [RAW] }]);
    const result = await collectMailDump({
      connector: connector as never,
      context: CONTEXT,
      queries: ["bad", "good"],
      maxMessages: 10,
    });
    expect(result.summaries[0]?.error).toBe("rate limited");
    expect(result.records).toHaveLength(1);
  });

  it("writes a dump file with honest coverage and newest-first lines", () => {
    const older = { ...toMailDumpRecord(RAW)!, id: "old", timestamp: "2026-01-01T00:00:00Z" };
    const contents = buildMailDumpFile({
      intent: "acme invoices",
      records: [older, toMailDumpRecord(RAW)!],
      summaries: [{ query: "from:acme.com", found: 2, pages: 1, capped: false }],
      cappedTotal: false,
    });
    expect(contents).toContain("# Email dump — acme invoices");
    expect(contents).toContain("query `from:acme.com`: 2 messages");
    expect(contents).toContain("Collection completed within limits.");
    expect(contents.indexOf("id=abc123")).toBeLessThan(contents.indexOf("id=old"));
  });
});
