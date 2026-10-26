// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({ t: text }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: text, i18n: { locale: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
const api = vi.hoisted(() => ({ waiting: vi.fn(), update: vi.fn() }));
vi.mock("../lib/rpc", () => ({
  rpc: { scratchpad: { waitingOnYou: api.waiting, update: api.update } },
}));

import { BotTodos } from "./BotTodos";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const day = 86_400_000;
const item = (id: string, over = {}) => ({
  id,
  botId: "bot_ada",
  botName: "Ada",
  title: `Todo ${id}`,
  waitingOn: "you",
  dueAt: null,
  ...over,
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const mount = async (props: Parameters<typeof BotTodos>[0] = {}) => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <BotTodos {...props} />
      </MemoryRouter>,
    ),
  );
};
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api.waiting.mockReset();
  api.update.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("lists undated and overdue items with a link to the bot", async () => {
  api.waiting.mockResolvedValue([
    item("1"),
    item("2", { dueAt: new Date(Date.now() - 3 * day).toISOString() }),
  ]);
  await mount();
  expect(container.textContent).toContain("Todo 1");
  expect(container.querySelector('a[href="/app/bot_ada"]')).not.toBeNull();
  expect(container.querySelector(".text-destructive")).not.toBeNull();
});

it("renders nothing when there are no items or loading fails", async () => {
  api.waiting.mockResolvedValue([]);
  await mount();
  expect(container.innerHTML).toBe("");
  api.waiting.mockRejectedValue(new Error("down"));
  await mount();
  expect(container.innerHTML).toBe("");
});

it("skips items whose due date is already on the grid", async () => {
  const from = new Date(Date.now() - day);
  const to = new Date(Date.now() + 7 * day);
  api.waiting.mockResolvedValue([
    item("1", { dueAt: new Date(Date.now() + 2 * day).toISOString() }),
    item("2"),
  ]);
  await mount({ hideDueBetween: { from, to } });
  expect(container.textContent).not.toContain("Todo 1");
  expect(container.textContent).toContain("Todo 2");
});

it("marks an item done and removes it", async () => {
  api.waiting.mockResolvedValue([item("1")]);
  api.update.mockResolvedValue({});
  await mount();
  await act(async () => {
    container.querySelector<HTMLElement>('[role="checkbox"]')?.click();
  });
  expect(api.update).toHaveBeenCalledWith({ itemId: "1", status: "done" });
  expect(container.innerHTML).toBe("");
});
