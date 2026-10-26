// @vitest-environment jsdom

import type { CalendarAgenda } from "@rakazo/contracts";
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

const agendaMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/rpc", () => ({ rpc: { calendar: { agenda: agendaMock } } }));

import { CalendarPage } from "./Calendar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date();
const at = (days: number, hour: number) =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days, hour)).toISOString();
const base = { end: null, allDay: false, botId: null, botName: null, account: null, href: null };
const agenda = (over: Partial<CalendarAgenda> = {}): CalendarAgenda => ({
  items: [
    { ...base, id: "e1", kind: "event", title: "Board call", start: at(1, 15), account: "Work" },
    {
      ...base,
      id: "c1",
      kind: "check_back",
      title: "Look at pricing",
      start: at(2, 15),
      botId: "b1",
      botName: "Ada",
    },
  ],
  errors: [],
  googleConnected: true,
  ...over,
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const flush = () => act(async () => {});
const mount = async (entry = "/app/calendar") => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <CalendarPage />
      </MemoryRouter>,
    ),
  );
  await flush();
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  agendaMock.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("lists items and filters by kind from the URL", async () => {
  agendaMock.mockResolvedValue(agenda());
  await mount();
  expect(container.textContent).toContain("Board call");
  expect(container.textContent).toContain("Look at pricing");
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount("/app/calendar?kind=check_back");
  expect(container.textContent).not.toContain("Board call");
  expect(container.textContent).toContain("Look at pricing");
});

it("says nothing is scheduled when the list is empty", async () => {
  agendaMock.mockResolvedValue(agenda({ items: [] }));
  await mount();
  expect(container.textContent).toContain("Nothing scheduled");
});

it("names an account that could not load and offers to connect Google when none is", async () => {
  agendaMock.mockResolvedValue(
    agenda({ errors: [{ account: "Work", message: "x" }], googleConnected: false }),
  );
  await mount();
  expect(container.textContent).toContain("Couldn't load Work");
  expect(container.textContent).toContain("Connect Google Calendar");
  expect(container.textContent).toContain("Look at pricing");
});
