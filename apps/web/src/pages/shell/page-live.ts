import type { PageChart, PageLiveBlock, PinFormat } from "@rakazo/contracts";
import { createContext, useContext } from "react";

/** Lets every live block on the open page read its data without prop drilling through the editor. */
export type PageLive = {
  /** False until the first load, so blocks shimmer instead of flashing "No data yet". */
  loaded: boolean;
  refreshing: boolean;
  blocks: ReadonlyMap<string, PageLiveBlock>;
  refresh: () => void;
};

export const PageLiveContext = createContext<PageLive>({
  loaded: true,
  refreshing: false,
  blocks: new Map(),
  refresh: () => undefined,
});
export const usePageLive = () => useContext(PageLiveContext);

type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

/** Identifies a live node by what it shows, so data survives local deletes without index bookkeeping. */
export const liveKey = (type: string, value: unknown): string => `${type}:${JSON.stringify(value)}`;

export const chartKey = (chart: PageChart) => liveKey("pageChart", chart);

function liveKeyOf(node: JsonNode): string | null {
  if (node.type === "pageMetric" || node.type === "pageTable")
    return liveKey(node.type, node.attrs?.block);
  const chart = node.attrs?.chart as PageChart | undefined;
  return node.type === "pageChart" && chart?.source ? chartKey(chart) : null;
}

/**
 * Pairs the i-th live node of a saved document with blocks[i] (the order `pages.data` uses:
 * metric and table fences and charts with a source; static charts are skipped).
 */
export function mapLiveBlocks(doc: JsonNode, blocks: PageLiveBlock[]): Map<string, PageLiveBlock> {
  const result = new Map<string, PageLiveBlock>();
  let index = 0;
  const walk = (node: JsonNode) => {
    const key = liveKeyOf(node);
    if (key) {
      const block = blocks[index++];
      if (block) result.set(key, block);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return result;
}

/** Same rules as the server's pin formatter, for table cells (metric text arrives formatted). */
export function formatCell(value: unknown, format?: PinFormat): string {
  if (value === null || value === undefined) return "";
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (format && format !== "text" && typeof n === "number" && Number.isFinite(n)) {
    if (format === "percent") return `${n.toFixed(1)}%`;
    if (format === "number") return new Intl.NumberFormat("en-US").format(n);
    const digits = Math.abs(n) >= 1000 ? 0 : 2;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Columns to show: the block's, or the keys of the first row. */
export function tableColumns(
  columns: { key: string; label: string; format?: PinFormat }[] | undefined,
  rows: unknown[],
) {
  if (columns) return columns;
  const first = rows[0];
  const keys = isRecord(first) ? Object.keys(first) : ["value"];
  return keys.map((key) => ({ key, label: key, format: undefined as PinFormat | undefined }));
}

export const cellValue = (row: unknown, key: string): unknown =>
  isRecord(row) ? row[key] : key === "value" ? row : undefined;
