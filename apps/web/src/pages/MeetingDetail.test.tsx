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
vi.mock("@lingui/core/macro", () => ({ t: text, plural: () => "" }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: text, i18n: { locale: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
const rpcMock = vi.hoisted(() => ({ meetings: { get: vi.fn() }, inbox: { todos: {} } }));
vi.mock("../lib/rpc", () => ({ rpc: rpcMock }));

import { MeetingDetailPage } from "./MeetingDetail";
import { detail } from "./meetings-fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("shows 3 decisions on a phone and the rest after See all", async () => {
  const decisions = [1, 2, 3, 4, 5].map((n) => `Decision number ${n}`);
  rpcMock.meetings.get.mockResolvedValue({ ...detail, decisions, followUps: [], todos: [] });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <MeetingDetailPage meetingId="m2" />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  const shown = () => (container.textContent?.match(/Decision number/g) ?? []).length;
  expect(shown()).toBe(3);
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "See all (5)",
  );
  await act(async () => button?.click());
  expect(shown()).toBe(5);
});
