import type { BluetoothDevice, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createBluetoothPicker } from "./bluetooth-picker.js";
import { isAppWebContents } from "./session-permissions.js";

const omi = { deviceId: "a", deviceName: "Omi" } as BluetoothDevice;
const other = { deviceId: "b", deviceName: "" } as BluetoothDevice;

function fixture(saved: string | null = null) {
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const choose = vi.fn<(names: string[]) => Promise<number>>();
  const writeSaved = vi.fn();
  const picker = createBluetoothPicker({
    readSaved: () => saved,
    writeSaved,
    choose,
    setTimer: (fn, ms) => {
      const timer = { fn, ms, live: true };
      timers.push(timer);
      return timer;
    },
    clearTimer: (t) => {
      (t as { live: boolean }).live = false;
    },
  });
  return {
    picker,
    choose,
    writeSaved,
    fire: (ms: number) => timers.filter((t) => t.ms === ms && t.live).forEach((t) => t.fn()),
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("bluetooth picker", () => {
  it("selects a saved device immediately without a dialog", () => {
    const f = fixture("a");
    const cb = vi.fn();
    f.picker.select([other, omi], cb);
    expect(cb).toHaveBeenCalledWith("a");
    expect(f.choose).not.toHaveBeenCalled();
  });

  it("collects devices, then prompts with names and saves the choice", async () => {
    const f = fixture();
    f.choose.mockResolvedValue(1);
    const cb = vi.fn();
    f.picker.select([omi], cb);
    f.picker.select([omi, other], cb);
    expect(f.choose).not.toHaveBeenCalled();
    f.fire(3000);
    await flush();
    expect(f.choose).toHaveBeenCalledWith(["Omi", "Unknown device"]);
    expect(cb).toHaveBeenCalledWith("b");
    expect(f.writeSaved).toHaveBeenCalledWith("b");
  });

  it("answers an empty id and saves nothing when cancelled", async () => {
    const f = fixture();
    f.choose.mockResolvedValue(-1);
    const cb = vi.fn();
    f.picker.select([omi], cb);
    f.fire(3000);
    await flush();
    expect(cb).toHaveBeenCalledWith("");
    expect(f.writeSaved).not.toHaveBeenCalled();
  });

  it("uses the newest callback for the same scan and a fresh request after finishing", async () => {
    const f = fixture();
    f.choose.mockResolvedValue(0);
    const first = vi.fn();
    const second = vi.fn();
    f.picker.select([omi], first);
    f.picker.select([omi], second);
    f.fire(3000);
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("a");
    const third = vi.fn();
    f.picker.select([omi], third);
    f.fire(3000);
    await flush();
    expect(third).toHaveBeenCalledWith("a");
  });

  it("prompts as soon as a device appears after the collect window", async () => {
    const f = fixture();
    f.choose.mockResolvedValue(0);
    const cb = vi.fn();
    f.picker.select([], cb);
    f.fire(3000);
    expect(f.choose).not.toHaveBeenCalled();
    f.picker.select([omi], cb);
    await flush();
    expect(cb).toHaveBeenCalledWith("a");
  });

  it("gives up with an empty id when no device appears in 30 seconds", () => {
    const f = fixture();
    const cb = vi.fn();
    f.picker.select([], cb);
    f.fire(3000);
    f.fire(30000);
    expect(cb).toHaveBeenCalledWith("");
    expect(f.choose).not.toHaveBeenCalled();
  });

  it("cancel() answers an empty id", () => {
    const f = fixture();
    const cb = vi.fn();
    f.picker.select([omi], cb);
    f.picker.cancel();
    expect(cb).toHaveBeenCalledWith("");
  });

  it("confirms pairing only when the user picks the device", async () => {
    const f = fixture();
    f.choose.mockResolvedValueOnce(0).mockResolvedValueOnce(-1);
    expect(await f.picker.confirmPairing("a")).toBe(true);
    expect(await f.picker.confirmPairing("a")).toBe(false);
  });
});

describe("Bluetooth app-origin rule", () => {
  const contents = (url: string) =>
    ({ isDestroyed: () => false, getURL: () => url }) as unknown as WebContents;
  it("allows only the app window on the app origin", () => {
    const app = contents("https://app.example.test/chat");
    const target = () => ({ webContents: app, url: "https://app.example.test/" });
    expect(isAppWebContents(app, target)).toBe(true);
    expect(isAppWebContents(contents("https://app.example.test/"), target)).toBe(false);
    const away = contents("https://evil.example.test/");
    expect(
      isAppWebContents(away, () => ({ webContents: away, url: "https://app.example.test/" })),
    ).toBe(false);
    expect(isAppWebContents(app, () => null)).toBe(false);
  });
});
