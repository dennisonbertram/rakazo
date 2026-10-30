// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { IntegrationsData } from "./useIntegrations";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray) => parts.join(""),
}));
vi.mock("../../lib/omi/useOmiSync", () => ({
  useOmiSync: () => ({ state: { kind: "idle" }, sync: () => undefined }),
}));
const rpc = vi.hoisted(() => ({
  omi: {
    status: vi.fn(),
    deleteRecordings: vi.fn(),
    disconnect: vi.fn(),
    segments: { list: vi.fn(), move: vi.fn() },
  },
  dataRoom: { items: { list: vi.fn() } },
  connections: { access: vi.fn() },
}));
vi.mock("../../lib/rpc", () => ({ rpc }));

import { OmiPage } from "./OmiPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | undefined;
afterEach(() => {
  container?.remove();
  vi.clearAllMocks();
});

const connected = { connectionId: "c1", pendingUploads: 0, recordings: 1, agentBotId: null };
const today = new Date().toISOString();
const segment = {
  id: "s1",
  audioItemId: "a1",
  kind: "note",
  title: "Idea for onboarding email",
  startedAt: today,
  endedAt: today,
  sortedBy: "agent",
  meetingId: null,
  noteItemId: null,
};

async function render() {
  container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    createRoot(container as HTMLDivElement).render(
      <MemoryRouter>
        <OmiPage data={{ bots: [] } as unknown as IntegrationsData} />
      </MemoryRouter>,
    );
  });
  return container;
}

it("asks for a transcription key when a ready Omi item has that error", async () => {
  rpc.omi.status.mockResolvedValue(connected);
  rpc.omi.segments.list.mockResolvedValue([]);
  rpc.dataRoom.items.list.mockResolvedValue({
    items: [{ source: "omi", status: "ready", error: "no_transcription_provider" }],
    nextCursor: null,
  });
  const view = await render();
  expect(rpc.dataRoom.items.list).toHaveBeenCalledWith(expect.objectContaining({ source: "omi" }));
  expect(view.textContent).toContain("Add a transcription key");
});

it("clears Today after Delete all recordings without a reload", async () => {
  rpc.omi.status.mockResolvedValue(connected);
  rpc.dataRoom.items.list.mockResolvedValue({ items: [], nextCursor: null });
  rpc.omi.segments.list.mockResolvedValue([segment]);
  rpc.omi.deleteRecordings.mockImplementation(async () => {
    rpc.omi.segments.list.mockResolvedValue([]);
    return { ok: true };
  });
  const view = await render();
  expect(view.textContent).toContain("Idea for onboarding email");
  const more = view.querySelector<HTMLElement>('button[aria-label="More"]');
  await act(async () => {
    more?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    more?.click();
  });
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
    el.textContent?.includes("Delete all recordings"),
  );
  await act(async () => item?.click());
  const confirm = Array.from(document.querySelectorAll<HTMLElement>("button")).find(
    (el) => el.textContent === "Delete",
  );
  await act(async () => confirm?.click());
  expect(rpc.omi.deleteRecordings).toHaveBeenCalled();
  expect(view.textContent).not.toContain("Idea for onboarding email");
});
