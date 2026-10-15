import type { PageChart } from "@rakazo/contracts";
import { PAGE_CHART_FENCE } from "@rakazo/contracts";
import { pageChartFence, parsePageChart } from "@rakazo/core";
import { Node } from "@tiptap/react";

/** The one place chart rows are read, so live data can replace the snapshot later. */
export function usePageChartRows(chart: PageChart): unknown[] {
  return chart.data;
}

const FENCE = new RegExp(
  `^\`\`\`${PAGE_CHART_FENCE}[ \\t]*\\n([\\s\\S]*?)\\n\`\`\`[ \\t]*(?:\\n|$)`,
);

/**
 * A ```chart fence as an atom block. A fence that does not parse becomes a plain code block,
 * so nothing is lost. Charts can be deleted, not edited.
 */
export const PageChartNode = Node.create({
  name: "pageChart",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { chart: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-page-chart]" }];
  },
  renderHTML() {
    return ["div", { "data-page-chart": "" }];
  },
  markdownTokenizer: {
    name: "pageChart",
    level: "block",
    start: (src: string) => src.indexOf(`\`\`\`${PAGE_CHART_FENCE}`),
    tokenize: (src: string) => {
      const match = FENCE.exec(src);
      return match ? { type: "pageChart", raw: match[0], text: match[1] ?? "" } : undefined;
    },
  },
  parseMarkdown: (token) => {
    const raw = String(token.text ?? "");
    const result = parsePageChart(raw);
    if ("chart" in result) return { type: "pageChart", attrs: { chart: result.chart } };
    return {
      type: "codeBlock",
      attrs: { language: PAGE_CHART_FENCE },
      content: raw ? [{ type: "text", text: raw }] : [],
    };
  },
  renderMarkdown: (node) => pageChartFence(node.attrs?.chart as PageChart),
});
