// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const tag = vi.hoisted(() => (parts: TemplateStringsArray, ...values: unknown[]) =>
  parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: tag }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@lingui/core/macro", () => ({ t: tag }));

const rpc = vi.hoisted(() => ({
  meetings: { list: vi.fn(), get: vi.fn(), delete: vi.fn() },
  inbox: { todos: { setDone: vi.fn() } },
}));
vi.mock("../lib/rpc", () => ({ rpc }));

import { MeetingDetailPage } from "./MeetingDetail";
import { MeetingsPage } from "./Meetings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (id: string, title: string, provider: string) => ({
  id,
  title,
  provider,
  startedAt: "2026-10-19T10:00:00.000Z",
  endedAt: "2026-10-19T10:30:00.000Z",
});
const rows = [row("m1", "Weekly sync", "granola"), row("m2", "Zoom call", "hex")];

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

async function mount(node: ReactNode, url = "/app/meetings") {
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () =>
    createRoot(container).render(<MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>),
  );
  return container;
}

it("lists every source with its duration and filters by the source in the URL", async () => {
  rpc.meetings.list.mockResolvedValue({ items: rows, nextCursor: null });
  const all = await mount(<MeetingsPage />);
  expect(all.textContent).toContain("Weekly sync");
  expect(all.textContent).toContain("Zoom call");
  expect(all.textContent).toContain("30 min");
  document.body.innerHTML = "";
  const granola = await mount(<MeetingsPage />, "/app/meetings?source=granola");
  expect(granola.textContent).toContain("Weekly sync");
  expect(granola.textContent).not.toContain("Zoom call");
});

it("searches titles", async () => {
  rpc.meetings.list.mockResolvedValue({ items: rows, nextCursor: null });
  const page = await mount(<MeetingsPage />, "/app/meetings?q=zoom");
  expect(page.textContent).toContain("Zoom call");
  expect(page.textContent).not.toContain("Weekly sync");
});

it("says No meetings when there are none", async () => {
  rpc.meetings.list.mockResolvedValue({ items: [], nextCursor: null });
  const page = await mount(<MeetingsPage />);
  expect(page.textContent).toContain("No meetings");
  expect(page.querySelector("table")).toBeNull();
});

it("shows a meeting's digest and to-dos with the transcript collapsed", async () => {
  rpc.meetings.get.mockResolvedValue({
    ...rows[1],
    summary: "",
    decisions: ["Ship on Friday"],
    followUps: ["Who books the room?"],
    todos: [{ id: "t1", text: "Send the deck", dueOn: null, doneAt: null }],
    transcript: "Ada: hello there",
  });
  const page = await mount(<MeetingDetailPage meetingId="m2" />, "/app/meetings/m2");
  expect(page.textContent).toContain("Ship on Friday");
  expect(page.textContent).toContain("Who books the room?");
  expect(page.textContent).toContain("Send the deck");
  expect(rpc.meetings.get).toHaveBeenCalledWith({ meetingId: "m2" });
  const transcript = page.querySelector("details");
  expect(transcript?.open).toBe(false);
  expect(transcript?.textContent).toContain("Transcript");
});
