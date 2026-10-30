import type { PageData } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { renderPageSnapshotHtml } from "./page-snapshot.js";

const fence = (lang: string, body: unknown) => `\`\`\`${lang}\n${JSON.stringify(body)}\n\`\`\``;
const SECRET_CALL = "SECRETCALL_list_invoices_7731";

const content = [
  "# Cash <script>alert(1)</script>",
  "Visit [site](https://example.com/a) and [bad](javascript:alert(1)) <img src=https://evil.test/x.png>",
  fence("metric", { label: "Runway", source: SECRET_CALL, path: "/months", format: "number" }),
  fence("table", {
    name: "Invoices",
    source: SECRET_CALL,
    columns: [
      { key: "who", label: "Who" },
      { key: "amt", label: "Amount", format: "usd" },
    ],
  }),
  fence("chart", {
    name: "Burn",
    spec: { marks: [{ type: "barY", options: { x: "m", y: "v" } }] },
    data: [{ m: "Jan", v: 3 }],
  }),
  fence("chart", {
    name: "Live",
    source: SECRET_CALL,
    path: "/rows",
    spec: { marks: [{ type: "barY", options: { x: "m", y: "v" } }] },
    data: [],
  }),
  fence("metric", { label: "Gone", source: "nope", path: "" }),
  fence("metric", { label: "Waiting", source: "p", path: "" }),
].join("\n\n");

const data: PageData = {
  pageId: "p1",
  revision: 1,
  blocks: [
    { status: "ok", fetchedAt: "2026-10-30T10:00:00Z", text: "14" },
    {
      status: "failed",
      fetchedAt: "2026-10-30T10:00:00Z",
      error: `call ${SECRET_CALL} to https://api.internal.test failed`,
      rows: [{ who: "Ada <b>", amt: 1234 }],
    },
    { status: "ok", fetchedAt: "2026-10-30T10:00:00Z", rows: [{ m: "Feb", v: 9 }] },
    { status: "missing", fetchedAt: null },
    { status: "pending", fetchedAt: null },
  ],
};

describe("renderPageSnapshotHtml", () => {
  it("renders a self-contained static document from rendered values only", async () => {
    const html = await renderPageSnapshotHtml(
      { title: "Cash & more", content },
      data,
      new Date("2026-10-30T12:34:00Z"),
    );
    expect(html).toContain("<h1>Cash &amp; more</h1>");
    expect(html).toContain("Snapshot 2026-10-30 12:34 UTC");
    expect(html).toContain('<p class="v">14</p>');
    expect(html).toContain("<td>$1,234</td>");
    expect(html).toContain("<td>Ada &lt;b&gt;</td>");
    expect(html).toContain("<svg");
    expect(html).toContain("Source not found");
    expect(html).toContain("Waiting for approval");
    // Page text is data, never markup.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<a href="https://example.com/a"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;img");
    // Nothing about the sources, and nothing loaded from outside.
    for (const leak of [SECRET_CALL, "api.internal.test", "failed"])
      expect(html).not.toContain(leak);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Chart could not be rendered");
    // The only URL is the link the page text itself contains (plus the one in its escaped text).
    expect(html.match(/https?:\/\/[^"'\s<]+/g)).toEqual([
      "https://example.com/a",
      "https://evil.test/x.png%3E",
      "https://evil.test/x.png&gt;",
    ]);
  });

  it("treats a missing kind as blocks and refuses an unknown kind", async () => {
    await expect(renderPageSnapshotHtml({ title: "T", content: "hi" }, data)).resolves.toContain(
      "<p>hi</p>",
    );
    await expect(
      renderPageSnapshotHtml({ title: "T", content: "hi", kind: "other" }, data),
    ).rejects.toThrow();
  });
});
