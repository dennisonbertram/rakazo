// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ scratchpad: { list: vi.fn() } }));
vi.mock("../lib/rpc", () => ({ rpc: api }));
const join = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      String.raw(parts, ...values),
);
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: join, i18n: { locale: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { ScratchpadSection } from "./ScratchpadSection";

const item = (id: string, title: string) => ({
  id,
  title,
  status: "open",
  dueAt: null,
  waitingOn: null,
});

it("reloads the list when refreshKey changes, so items added in chat appear", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.scratchpad.list.mockResolvedValueOnce([]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<ScratchpadSection botId="bot_1" refreshKey={0} />));
  expect(container.textContent).not.toContain("Call Acme");

  api.scratchpad.list.mockResolvedValueOnce([item("i1", "Call Acme")]);
  await act(async () => root.render(<ScratchpadSection botId="bot_1" refreshKey={1} />));
  expect(api.scratchpad.list).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Call Acme");
});
