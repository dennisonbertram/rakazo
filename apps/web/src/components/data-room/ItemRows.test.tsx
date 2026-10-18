// @vitest-environment jsdom

import type { DataRoomApiItem } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@lingui/core/macro", () => ({ t: (parts: TemplateStringsArray) => parts.join("") }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { GridView, ListView, type RowInteraction, SubfolderList } from "./ItemRows";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (id: string, folderId: string | null) =>
  ({
    id,
    name: `${id}.pdf`,
    folderId,
    status: "ready",
    mimeType: "application/pdf",
    source: "upload",
    createdAt: "2026-03-04T00:00:00.000Z",
    facets: { docType: null, docDate: null, parties: [] },
  }) as unknown as DataRoomApiItem;

const o = (openFolderId?: string): RowInteraction => ({
  shownId: undefined,
  onSelect: () => undefined,
  onToggle: () => undefined,
  onAction: () => undefined,
  folderPath: (id) => (id === "f-legal" ? "Legal" : ""),
  openFolderId,
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const names = () =>
  Array.from(container.querySelectorAll('[data-testid="data-room-name"]')).map(
    (cell) => cell.textContent,
  );

it("names each row's folder in All items, and not inside that folder", () => {
  const rows = [item("lease", "f-legal"), item("loose", null)].map((i) => ({
    item: i,
    snippets: [],
  }));
  act(() => root.render(<ListView rows={rows} o={o()} />));
  expect(names()).toEqual(["lease.pdfLegalNot tagged", "loose.pdfNot tagged"]);
  act(() => root.render(<ListView rows={rows.slice(0, 1)} o={o("f-legal")} />));
  expect(names()).toEqual(["lease.pdfNot tagged"]);
});

it("puts the status in its own column as a badge, and never in the Type cell", () => {
  const rows = [
    { ...item("junk", null), status: "failed" },
    { ...item("busy", null), status: "processing" },
    item("a-much-longer-file-name", null),
  ].map((i) => ({ item: i as DataRoomApiItem, snippets: [] }));
  act(() => root.render(<ListView rows={rows} o={o()} />));
  const cells = Array.from(container.querySelectorAll('[data-testid="data-room-status"]'));
  expect(cells.map((cell) => cell.textContent)).toEqual(["Failed", "Reading", ""]);
  expect(cells[0]?.querySelector("[data-slot=badge]")).not.toBeNull();
  // The Type and Date cells (truncated text) never hold a status word.
  for (const row of container.querySelectorAll("[data-row]")) {
    const text = Array.from(row.children)
      .filter((c) => c.className.includes("truncate"))
      .map((c) => c.textContent)
      .join("|");
    expect(text).not.toMatch(/Reading|Failed/);
  }
  // The failed row also says why under its name, so phones (no Status column) still explain it.
  expect(names()[0]).toContain("Could not read this file. Delete it and upload it again.");
  expect(container.querySelectorAll('[data-testid="data-room-failed-reason"]')).toHaveLength(1);
});

it("uses one grid for the header and every row, whether or not any row has tags or a status", () => {
  const plain = [item("plain", null)].map((i) => ({ item: i, snippets: [] }));
  const mixed = [
    { ...item("busy", null), status: "processing" },
    tagged("deck", "investor", null),
  ].map((i) => ({ item: i as DataRoomApiItem, snippets: [] }));
  const grids = (rows: typeof plain) => {
    act(() => root.render(<ListView rows={rows} o={o()} />));
    return [
      container.querySelector('[data-testid="data-room-head"]')?.className,
      ...Array.from(container.querySelectorAll("[data-row]")).map((r) => r.className),
    ].map((c) => c?.match(/grid-cols-\S+/g)?.join(" "));
  };
  const before = grids(plain);
  const after = grids(mixed);
  expect(new Set([...before, ...after]).size).toBe(1);
});

it("has an inline Try again on a failed row that retries once and does not open the preview", () => {
  const onAction = vi.fn();
  const onToggle = vi.fn();
  const rows = [{ ...item("junk", null), status: "failed" }, item("fine", null)].map((i) => ({
    item: i as DataRoomApiItem,
    snippets: [],
  }));
  for (const View of [ListView, GridView]) {
    onAction.mockClear();
    act(() => root.render(<View rows={rows} o={{ ...o(), onAction, onToggle }} />));
    const retry = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Try again",
    );
    expect(retry).toHaveLength(1);
    expect(retry[0]?.closest("[data-item-id]")?.getAttribute("data-item-id")).toBe("junk");
    act(() => retry[0]?.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("retry", expect.objectContaining({ id: "junk" }));
    expect(onToggle).not.toHaveBeenCalled();
  }
});

it("follows the sort in the Date column: Added by default, Document date when sorted by it", () => {
  const rows = [
    {
      ...tagged("deck", "investor", "2025-12-21T00:00:00.000Z"),
      createdAt: "2026-03-04T00:00:00.000Z",
    },
  ].map((i) => ({ item: i, snippets: [] }));
  const header = () => container.querySelector('[data-testid="data-room-head"]')?.textContent;
  const dateCell = () =>
    container.querySelector("[data-row]")?.querySelectorAll(":scope > span")[2]?.textContent;
  act(() => root.render(<ListView rows={rows} o={o()} />));
  expect(header()).toContain("Added");
  expect(header()).not.toContain("Document date");
  expect(dateCell()).toBe("Mar 4, 2026");
  act(() => root.render(<ListView rows={rows} o={o()} sortField="createdAt" />));
  expect(dateCell()).toBe("Mar 4, 2026");
  act(() => root.render(<ListView rows={rows} o={o()} sortField="date" />));
  expect(header()).toContain("Document date");
  expect(dateCell()).toBe("Dec 21, 2025");
});

it("says in the row why a file failed, not only in a tooltip", () => {
  const rows = [
    { ...item("scan", null), status: "failed", error: "This file isn't a readable PDF." },
    item("fine", null),
  ].map((i) => ({ item: i as DataRoomApiItem, snippets: [] }));
  act(() => root.render(<ListView rows={rows} o={o()} />));
  const errors = Array.from(container.querySelectorAll('[data-testid="data-room-error"]'));
  expect(errors.map((cell) => cell.textContent)).toEqual(["This file isn't a readable PDF."]);
});

it("gives every sub-folder a More actions menu", () => {
  const onAction = vi.fn();
  const invoices = { id: "f2", name: "Invoices", parentId: "f1", createdAt: "" };
  for (const tiles of [false, true]) {
    act(() =>
      root.render(
        <SubfolderList
          folders={[invoices]}
          contents={() => "2 items"}
          onOpen={vi.fn()}
          onAction={onAction}
          tiles={tiles}
        />,
      ),
    );
    expect(container.querySelector('li button[aria-label^="More actions for"]')).not.toBeNull();
  }
});

it("keeps a renamed file's type while search re-indexes it, and names a failure under the name", () => {
  const typed = (id: string, status: string) =>
    ({
      ...item(id, null),
      status,
      facets: { docType: "Roadmap", docDate: null, parties: [] },
    }) as unknown as DataRoomApiItem;
  const rows = [typed("roadmap", "indexing"), typed("scan", "failed")].map((i) => ({
    item: i,
    snippets: [],
  }));
  act(() => root.render(<ListView rows={rows} o={o()} />));
  expect(container.textContent).toContain("Roadmap");
  expect(container.textContent).not.toContain("Reading");
  // The phone-only line under the name, for where the Type column is hidden.
  expect(names()[1]).toContain("scan.pdfFailed");
});

const tagged = (id: string, docType: string | null, docDate: string | null) =>
  ({
    ...item(id, null),
    facets: { docType, docDate, parties: docType ? ["Quill Capital (Mock)"] : [] },
  }) as unknown as DataRoomApiItem;

it("puts the type and date under the name for a phone, and says when a file is not tagged", () => {
  const rows = [
    tagged("deck", "presentation", "2025-12-21T00:00:00.000Z"),
    tagged("sheet", null, null),
  ].map((i) => ({ item: i, snippets: [] }));
  act(() => root.render(<ListView rows={rows} o={o()} sortField="date" />));
  const lines = Array.from(container.querySelectorAll('[data-testid="data-room-subline"]')).map(
    (line) => line.textContent,
  );
  expect(lines[0]).toMatch(/^Presentation · Dec 21, 2025$/);
  expect(lines[1]).toBe("Not tagged");
});

it("bolds only the shown row's name, so its type and parties keep their width", () => {
  const rows = [tagged("deck", "investor", null)].map((i) => ({ item: i, snippets: [] }));
  act(() => root.render(<ListView rows={rows} o={{ ...o(), shownId: "deck" }} />));
  const row = container.querySelector('[data-item-id="deck"]');
  expect(row?.className).not.toContain("font-medium");
  expect(row?.querySelector('[title="deck.pdf"]')?.className).toContain("font-medium");
  // A long party wraps to a second line instead of losing the end of its name.
  const parties = row?.querySelector('[data-testid="data-room-parties"]')?.className ?? "";
  expect(parties).toContain("line-clamp-2");
  expect(parties).not.toContain("truncate");
});

it("gives a tile's type and date a line each, and marks an untagged tile", () => {
  const rows = [
    tagged("deck", "presentation", "2025-12-21T00:00:00.000Z"),
    tagged("sheet", null, null),
  ].map((i) => ({ item: i, snippets: [] }));
  act(() => root.render(<GridView rows={rows} o={o()} sortField="date" />));
  const tiles = Array.from(container.querySelectorAll("[data-item-id]"));
  const lines = (tile: Element) =>
    Array.from(tile.querySelectorAll('[data-testid="data-room-tile-meta"] > span')).map(
      (s) => s.textContent,
    );
  expect(lines(tiles[0] as Element)).toEqual(["Presentation", "Dec 21, 2025"]);
  expect(tiles[1]?.textContent).toContain("Not tagged");
});
