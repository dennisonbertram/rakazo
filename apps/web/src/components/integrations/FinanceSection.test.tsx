// @vitest-environment jsdom

import type { FinanceSource } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const connect = vi.hoisted(() => vi.fn());
vi.mock("../../lib/finance-connect", () => ({ connectFinanceProvider: connect }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { FinanceSection } from "./FinanceSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const source = (provider: "mercury" | "brex", status: FinanceSource["status"]): FinanceSource => ({
  provider,
  serverId: status === "not_connected" ? null : "s1",
  status,
  lastSyncedAt: null,
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
async function show(sources: FinanceSource[], onChanged = vi.fn()) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <FinanceSection sources={sources} onChanged={onChanged} />
      </MemoryRouter>,
    ),
  );
  return onChanged;
}
const tile = (p: string) => container.querySelector(`[data-testid="finance-tile-${p}"]`);
const press = (p: string) =>
  act(async () => {
    (tile(p)?.querySelector("button") as HTMLButtonElement | null)?.click();
  });
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

it("connects through the Finance API and shows Open Finance once connected", async () => {
  connect.mockResolvedValue("connected");
  const onChanged = await show([source("mercury", "not_connected"), source("brex", "ok")]);
  expect(tile("mercury")?.textContent).toContain("Not connected");
  expect(tile("brex")?.textContent).toContain("Connected");
  expect(tile("brex")?.querySelector("a")?.getAttribute("href")).toBe("/app/finance");
  expect(tile("brex")?.querySelector("img")?.getAttribute("src")).toContain("brex");
  expect(tile("mercury")?.querySelector("img")).toBeNull();

  await press("mercury");
  expect(connect).toHaveBeenCalledWith("mercury", false);
  expect(onChanged).toHaveBeenCalled();
});

it("reconnects a source that needs it and reports a cancelled sign-in", async () => {
  connect.mockResolvedValue("cancelled");
  await show([source("mercury", "needs_reconnect"), source("brex", "error")]);
  expect(tile("mercury")?.textContent).toContain("Needs reconnect");
  expect(tile("brex")?.textContent).toContain("Failed");
  await press("mercury");
  expect(connect).toHaveBeenCalledWith("mercury", true);
  expect(tile("mercury")?.querySelector('[role="alert"]')?.textContent).toContain("cancelled");
});

it("shows a failed connect", async () => {
  connect.mockRejectedValue(new Error("Could not reach the server"));
  await show([source("mercury", "not_connected"), source("brex", "not_connected")]);
  await press("brex");
  expect(tile("brex")?.querySelector('[role="alert"]')?.textContent).toContain("Could not reach");
});
