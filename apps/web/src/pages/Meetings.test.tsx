// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const tag = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""),
);
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

it("lists every source with its duration", async () => {
  rpc.meetings.list.mockResolvedValue({ items: rows, nextCursor: null });
  const all = await mount(<MeetingsPage />);
  expect(all.textContent).toContain("Weekly sync");
  expect(all.textContent).toContain("Zoom call");
  expect(all.textContent).toContain("30 min");
  expect(rpc.meetings.list).toHaveBeenCalledWith({});
});

it("asks the server for the source and search in the URL", async () => {
  rpc.meetings.list.mockResolvedValue({ items: [rows[1]], nextCursor: null });
  const page = await mount(<MeetingsPage />, "/app/meetings?source=hex&q=zoom");
  expect(rpc.meetings.list).toHaveBeenCalledWith({ q: "zoom", provider: "hex" });
  expect(page.textContent).toContain("Zoom call");
});

it("keeps the search box when a filter matches nothing", async () => {
  rpc.meetings.list.mockResolvedValue({ items: [], nextCursor: null });
  const page = await mount(<MeetingsPage />, "/app/meetings?q=zzz");
  expect(page.querySelector("input[type=search]")).not.toBeNull();
  expect(page.textContent).toContain("No matches");
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

it("shows the meeting the page is on when an earlier one answers last", async () => {
  const full = (id: string, title: string) => ({
    ...row(id, title, "hex"),
    summary: "",
    decisions: [],
    followUps: [],
    todos: [],
    transcript: null,
  });
  let answerA: (value: unknown) => void = () => {};
  rpc.meetings.get.mockImplementation(({ meetingId }: { meetingId: string }) =>
    meetingId === "a"
      ? new Promise((resolve) => (answerA = resolve))
      : Promise.resolve(full("b", "Meeting B")),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const show = (id: string) =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <MeetingDetailPage meetingId={id} />
        </MemoryRouter>,
      ),
    );
  await show("a");
  await show("b");
  await act(async () => answerA(full("a", "Meeting A")));
  expect(container.textContent).toContain("Meeting B");
  expect(container.textContent).not.toContain("Meeting A");
});

it("says part of a recording could not be transcribed", async () => {
  const full = {
    ...rows[1],
    provider: "praci",
    summary: "",
    decisions: ["Ship on Friday"],
    followUps: [],
    todos: [],
    transcript: "Ada: hello",
  };
  rpc.meetings.get.mockResolvedValue({ ...full, partial: true });
  const partial = await mount(<MeetingDetailPage meetingId="m2" />, "/app/meetings/m2");
  expect(partial.textContent).toContain("Part of this meeting could not be transcribed.");
  rpc.meetings.get.mockResolvedValue({ ...full, partial: false });
  const whole = await mount(<MeetingDetailPage meetingId="m2" />, "/app/meetings/m2");
  expect(whole.textContent).not.toContain("could not be transcribed");
});

it("shows Summarizing while a fresh recording has only its transcript", async () => {
  rpc.meetings.get.mockResolvedValue({
    ...rows[1],
    provider: "praci",
    endedAt: new Date().toISOString(),
    summary: "",
    decisions: [],
    followUps: [],
    todos: [],
    transcript: "Ada: hello",
    partial: false,
  });
  const page = await mount(<MeetingDetailPage meetingId="m2" />, "/app/meetings/m2");
  expect(page.textContent).toContain("Summarizing…");
});
