// @vitest-environment jsdom

import { Markdown } from "@tiptap/markdown";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { expect, it } from "vitest";
import { resolveRemotePage } from "../../lib/page-sync";
import { PageChartNode } from "./page-chart-extension";

function roundTrip(content: string) {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, PageChartNode],
    content,
    contentType: "markdown",
  });
  const out = editor.getMarkdown();
  editor.destroy();
  return out;
}

const chart = {
  name: "Burn",
  spec: { marks: [{ type: "line", x: "m", y: "v" }] },
  data: [{ m: 1, v: 2 }],
};
const fence = `\`\`\`chart\n${JSON.stringify(chart)}\n\`\`\``;

it("keeps headings, lists and chart fences through load and save", () => {
  const page = `# Weekly\n\nIntro text.\n\n- one\n- two\n\n${fence}\n\nAfter.`;
  expect(roundTrip(page)).toBe(page);
});

it("keeps a chart fence that does not parse", () => {
  const page = "```chart\n{not json\n```";
  expect(roundTrip(page)).toBe(page);
});

it("reloads a remote update only when nothing is unsaved", () => {
  expect(resolveRemotePage({ dirty: false })).toBe("reload");
  expect(resolveRemotePage({ dirty: true })).toBe("offer");
});
