// @vitest-environment jsdom
import type { BotPage, PageData } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  data: vi.fn(),
  refresh: vi.fn(),
  sources: vi.fn(),
  removeSource: vi.fn(),
}));
vi.mock("../../lib/rpc", () => ({ rpc: { pages: mocks } }));
vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { setHideAmounts } from "../../lib/hide-amounts-preference";
import { BotPagePanel } from "./bot-page-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  setHideAmounts(false);
  vi.resetAllMocks();
});

const fence = (kind: string, value: unknown) => `\`\`\`${kind}\n${JSON.stringify(value)}\n\`\`\``;
const metric = { label: "Burn", source: "cash", path: "/burn", format: "usd" };
const table = {
  name: "Vendors",
  source: "spend",
  path: "/v",
  limit: 50,
  columns: [
    { key: "name", label: "Vendor" },
    { key: "total", label: "Total", format: "usd" },
  ],
};
const staticChart = { name: "Static", spec: { marks: [] }, data: [] };
const content = [fence("chart", staticChart), fence("metric", metric), fence("table", table)].join(
  "\n\n",
);
const page = (revision = 1): BotPage => ({
  id: "p1",
  botId: "bot_demo",
  title: "Cash",
  content,
  revision,
  updatedBy: "bot",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const data = (text: string, revision = 1): PageData => ({
  pageId: "p1",
  revision,
  blocks: [
    { status: "ok", fetchedAt: "2026-01-01T09:00:00.000Z", text },
    {
      status: "ok",
      fetchedAt: "2026-01-01T09:00:00.000Z",
      rows: [{ name: "Acme", total: 1234.5 }],
    },
  ],
});
const source = {
  id: "s1",
  pageId: "p1",
  name: "cash",
  kind: "praci",
  call: { tool: "finance_overview", args: {} },
  schedule: "1h",
  status: "active",
  lastRefreshAt: null,
  lastError: null,
};

const render = (props: Partial<Parameters<typeof BotPagePanel>[0]> = {}) =>
  act(async () => {
    root.render(<BotPagePanel botId="bot_demo" remote={null} {...props} />);
  });
const text = () => container.querySelector('[role="textbox"]')?.textContent ?? "";

beforeEach(() => {
  mocks.list.mockResolvedValue([{ id: "p1", title: "Cash", revision: 1, updatedAt: "x" }]);
  mocks.get.mockResolvedValue(page());
  mocks.data.mockResolvedValue(data("$86K"));
  mocks.sources.mockResolvedValue([source]);
});

it("pairs data with live blocks in document order, skipping the static chart", async () => {
  await render();
  expect(mocks.data).toHaveBeenCalledWith({ botId: "bot_demo", pageId: "p1" });
  expect(text()).toContain("$86K");
  expect(text()).toContain("Acme");
  expect(text()).toContain("$1,235");
});

it("masks usd metrics and usd table cells while amounts are hidden", async () => {
  setHideAmounts(true);
  await render();
  expect(text()).not.toContain("$86K");
  expect(text()).not.toContain("1,235");
  expect(text()).toContain("Acme");
  expect(text()).toContain("$•••");
});

it("keeps the last value and offers Retry when a refresh failed", async () => {
  mocks.data.mockResolvedValue({
    ...data("$86K"),
    blocks: [
      { status: "failed", fetchedAt: "2026-01-01T08:00:00.000Z", error: "timed out", text: "$86K" },
      { status: "missing", fetchedAt: null },
    ],
  });
  await render();
  expect(text()).toContain("$86K");
  expect(text()).toContain("Source not found");
  expect(container.querySelector('[aria-label="Source failed"]')).not.toBeNull();
});

it("shows pending and empty placeholders", async () => {
  mocks.data.mockResolvedValue({
    ...data(""),
    blocks: [
      { status: "pending", fetchedAt: null },
      { status: "empty", fetchedAt: null },
    ],
  });
  await render();
  expect(text()).toContain("Waiting for approval");
  expect(text()).toContain("No data yet");
});

it("reloads data on a page.data event for the open page only", async () => {
  await render({ dataRemote: { pageId: "p1", seq: 1 } });
  mocks.data.mockClear();
  mocks.data.mockResolvedValue(data("$90K"));
  await render({ dataRemote: { pageId: "other", seq: 2 } });
  expect(mocks.data).not.toHaveBeenCalled();
  await render({ dataRemote: { pageId: "p1", seq: 3 } });
  expect(mocks.data).toHaveBeenCalledTimes(1);
  expect(text()).toContain("$90K");
});

it("ignores data for another revision and keeps the last data", async () => {
  await render();
  mocks.data.mockResolvedValue(data("$99K", 5));
  await render({ dataRemote: { pageId: "p1", seq: 1 } });
  expect(text()).toContain("$86K");
  expect(text()).not.toContain("$99K");
});

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("missing element");
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"])
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  });
}
const byText = (label: string, selector = "*") =>
  [...document.querySelectorAll(selector)].find((el) => el.textContent === label);

async function openMenu() {
  await click(container.querySelector('[aria-label="Page options"]'));
}

it("hides Refresh and Sources when the page has no sources", async () => {
  mocks.sources.mockResolvedValue([]);
  await render();
  await openMenu();
  expect(byText("Rename", '[role="menuitem"]')).toBeTruthy();
  expect(byText("Refresh", '[role="menuitem"]')).toBeUndefined();
  expect(byText("Sources", '[role="menuitem"]')).toBeUndefined();
});

it("Refresh reruns the sources and shows the returned data", async () => {
  let finish: (value: PageData) => void = () => undefined;
  mocks.refresh.mockReturnValue(new Promise<PageData>((resolve) => (finish = resolve)));
  await render();
  await openMenu();
  await click(byText("Refresh", '[role="menuitem"]'));
  expect(mocks.refresh).toHaveBeenCalledWith({ botId: "bot_demo", pageId: "p1" });
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  await act(async () => finish(data("$91K")));
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  expect(text()).toContain("$91K");
});

it("Sources lists the page's sources and removes one after confirming", async () => {
  mocks.removeSource.mockResolvedValue({ ok: true });
  await render();
  await openMenu();
  await click(byText("Sources", '[role="menuitem"]'));
  expect(document.body.textContent).toContain("finance_overview");
  await click(document.querySelector('[aria-label="cash options"]'));
  await click(byText("Remove", '[role="menuitem"]'));
  expect(mocks.removeSource).not.toHaveBeenCalled();
  mocks.sources.mockResolvedValue([]);
  await click(byText("Remove", "button"));
  expect(mocks.removeSource).toHaveBeenCalledWith({ botId: "bot_demo", sourceId: "s1" });
  expect(document.body.textContent).toContain("No sources");
});

it("shows the error and Retry on the warning dot, and Retry reruns the sources", async () => {
  mocks.data.mockResolvedValue({
    ...data("$86K"),
    blocks: [
      { status: "failed", fetchedAt: "2026-01-01T08:00:00.000Z", error: "timed out", text: "$86K" },
      { status: "ok", fetchedAt: null, rows: [] },
    ],
  });
  mocks.refresh.mockResolvedValue(data("$87K"));
  await render();
  await click(container.querySelector('[aria-label="Source failed"]'));
  expect(document.body.textContent).toContain("timed out");
  await click(byText("Retry", "button"));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(text()).toContain("$87K");
});
