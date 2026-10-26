// @vitest-environment jsdom

import type { CalendarAgenda, CalendarItem } from "@rakazo/contracts";
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

/** Answers the way the API does: the bots' items for "local", the rest for "google". */
const answer = (full: CalendarAgenda) => (input: { sources?: "local" | "google" }) =>
  Promise.resolve({
    ...full,
    items: full.items.filter((item) => (input.sources === "local") === (item.kind !== "event")),
    errors: input.sources === "local" ? [] : full.errors,
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
  agendaMock.mockImplementation(answer(agenda()));
  await mount("/app/calendar?view=schedule");
  expect(container.textContent).toContain("Board call");
  expect(container.textContent).toContain("Look at pricing");
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount("/app/calendar?view=schedule&kind=check_back");
  expect(container.textContent).not.toContain("Board call");
  expect(container.textContent).toContain("Look at pricing");
});

it("says nothing is scheduled when the list is empty", async () => {
  agendaMock.mockImplementation(answer(agenda({ items: [] })));
  await mount("/app/calendar?view=schedule");
  expect(container.textContent).toContain("Nothing scheduled");
});

it("names an account that could not load and offers to connect Google when none is", async () => {
  agendaMock.mockImplementation(
    answer(agenda({ errors: [{ account: "Work", message: "x" }], googleConnected: false })),
  );
  await mount("/app/calendar?view=schedule");
  expect(container.textContent).toContain("Couldn't load Work");
  expect(container.textContent).toContain("Connect Google Calendar");
  expect(container.textContent).toContain("Look at pricing");
});

const local = (id: string, title: string, start: Date, over: Partial<CalendarItem> = {}) => ({
  ...base,
  id,
  kind: "todo" as const,
  title,
  start: start.toISOString(),
  botId: "b1",
  botName: "Ada",
  ...over,
});
const noon = () => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
const column = (day: string) => container.querySelector(`[data-day="${day}"]`)!;
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

it("shows the week grid and the bots' items while Google is still loading", async () => {
  agendaMock.mockImplementation((input: { sources?: string }) =>
    input.sources === "google"
      ? new Promise(() => {})
      : Promise.resolve(agenda({ items: [local("t1", "Send deck", noon())] })),
  );
  await mount();
  expect(container.querySelectorAll("[data-day]")).toHaveLength(7);
  expect(column(localDay(now)).textContent).toContain("Send deck");
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  expect(container.querySelector("[data-now-line]")).not.toBeNull();
});

it("draws the grid with nothing in it", async () => {
  agendaMock.mockImplementation(answer(agenda({ items: [] })));
  await mount();
  expect(container.querySelectorAll("[data-day]")).toHaveLength(7);
});

it("switches views through the URL and the buttons", async () => {
  agendaMock.mockImplementation(answer(agenda({ items: [] })));
  await mount("/app/calendar?view=day");
  expect(container.querySelectorAll("[data-day]")).toHaveLength(1);
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent === name)!;
  await act(async () => button("Week").click());
  expect(container.querySelectorAll("[data-day]")).toHaveLength(7);
  await act(async () => button("Month").click());
  expect(container.querySelector("table")).not.toBeNull();
  await act(async () => button("Schedule").click());
  expect(container.textContent).toContain("Nothing scheduled");
  const requests = agendaMock.mock.calls.map(([input]) => input.sources);
  expect(requests).toContain("local");
  expect(requests).toContain("google");
});

it("steps to the next period and back to today", async () => {
  agendaMock.mockImplementation(answer(agenda({ items: [] })));
  await mount("/app/calendar?view=day");
  const label = (name: string) => container.querySelector(`[aria-label="${name}"]`) as HTMLElement;
  const first = () => container.querySelector("[data-day]")!.getAttribute("data-day");
  const todayDay = first();
  await act(async () => label("Next").click());
  expect(first()).toBe(localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)));
  const todayButton = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Today",
  )!;
  await act(async () => todayButton.click());
  expect(first()).toBe(todayDay);
});

it("puts an item at 23:30 local on its own day, not the next", async () => {
  const late = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30);
  agendaMock.mockImplementation(answer(agenda({ items: [local("t2", "Late call", late)] })));
  await mount("/app/calendar?view=month");
  expect(column(localDay(late)).textContent).toContain("Late call");
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (localDay(next).slice(0, 7) === localDay(now).slice(0, 7))
    expect(column(localDay(next)).textContent).not.toContain("Late call");
});

it("keeps titles and drops icons when items overlap", async () => {
  const at9 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9);
  agendaMock.mockImplementation(
    answer(agenda({ items: [local("a", "First thing", at9), local("b", "Second thing", at9)] })),
  );
  await mount();
  const col = column(localDay(at9));
  expect(col.textContent).toContain("First thing");
  expect(col.textContent).toContain("Second thing");
  expect(col.querySelector('[role="img"]')).toBeNull();
});
