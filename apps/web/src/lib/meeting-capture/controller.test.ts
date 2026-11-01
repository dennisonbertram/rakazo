// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray) => parts.join(""),
}));
vi.mock("@rakazo/ui-web", () => ({ enqueueNotificationToast: vi.fn() }));
const rpc = vi.hoisted(() => ({
  meetingCaptures: { active: vi.fn(), finish: vi.fn() },
  meetings: { list: vi.fn() },
}));
vi.mock("../rpc", () => ({
  rpc,
  selectedSpaceId: () => null,
  withSpaceHeaders: (init?: HeadersInit) => new Headers(init),
}));

import { captureView, recoverCapture } from "./controller";

const active = {
  captureId: "c1",
  title: null,
  engine: "server",
  tracks: ["microphone"],
  status: "recording",
  startedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});
afterEach(() => vi.useRealTimers());

it("a reload after Stop uploads leftovers and finishes instead of recording again", async () => {
  localStorage.setItem("praci-capture-stopped", "c1");
  rpc.meetingCaptures.active.mockResolvedValueOnce(active).mockResolvedValue(null);
  rpc.meetingCaptures.finish.mockResolvedValue({ ok: true });
  rpc.meetings.list.mockResolvedValue({ items: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 201 })),
  );
  const done = recoverCapture();
  await vi.advanceTimersByTimeAsync(5000);
  await done;
  expect(rpc.meetingCaptures.finish).toHaveBeenCalledTimes(1);
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(captureView().phase).toBe("stored");
  expect(localStorage.getItem("praci-capture-stopped")).toBeNull();
});

it("a reload without the marker resumes the microphone", async () => {
  rpc.meetingCaptures.active.mockResolvedValue(active);
  vi.stubGlobal("fetch", vi.fn());
  // The microphone is refused, so the capture is finished with what arrived.
  (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("no"),
  );
  rpc.meetingCaptures.finish.mockResolvedValue({ ok: true });
  const done = recoverCapture();
  await vi.advanceTimersByTimeAsync(1000);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  void done;
});
