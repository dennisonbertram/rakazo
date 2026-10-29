import type { BluetoothDevice } from "electron";

const COLLECT_MS = 3_000;
const GIVE_UP_MS = 30_000;
export const UNKNOWN_DEVICE = "Unknown device";

export type BluetoothPickerDeps = {
  /** Previously chosen device id, if any. */
  readSaved: () => string | null;
  writeSaved: (deviceId: string) => void;
  /** Shows a native chooser with one button per name plus Cancel. Resolves to the index, or -1. */
  choose: (names: string[]) => Promise<number>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
};

type Pending = {
  callback: (deviceId: string) => void;
  devices: BluetoothDevice[];
  collectTimer: unknown;
  giveUpTimer: unknown;
  collecting: boolean;
  prompting: boolean;
};

/**
 * Answers Electron's repeating `select-bluetooth-device` event. Events from one scan share a
 * single pending request; the newest callback is the one that gets the answer.
 * ponytail: a second requestDevice during a scan looks like another scan event, so it cannot
 * be told apart; the page's own requestDevice rules apply.
 */
export function createBluetoothPicker(deps: BluetoothPickerDeps) {
  let pending: Pending | null = null;
  const names = new Map<string, string>();

  function finish(request: Pending, deviceId: string) {
    if (pending !== request) return;
    pending = null;
    deps.clearTimer(request.collectTimer);
    deps.clearTimer(request.giveUpTimer);
    if (deviceId !== "") {
      deps.writeSaved(deviceId);
    }
    request.callback(deviceId);
  }

  async function prompt(request: Pending) {
    if (request.prompting || request.devices.length === 0) return;
    request.prompting = true;
    const devices = request.devices;
    const labels = devices.map((device) => device.deviceName || UNKNOWN_DEVICE);
    for (const device of devices) names.set(device.deviceId, device.deviceName || UNKNOWN_DEVICE);
    let index = -1;
    try {
      index = await deps.choose(labels);
    } catch {
      index = -1;
    }
    finish(request, devices[index]?.deviceId ?? "");
  }

  return {
    select(devices: BluetoothDevice[], callback: (deviceId: string) => void) {
      const saved = deps.readSaved();
      const savedDevice = saved === null ? undefined : devices.find((d) => d.deviceId === saved);
      if (pending === null) {
        const request: Pending = {
          callback,
          devices,
          collecting: true,
          prompting: false,
          collectTimer: undefined,
          giveUpTimer: undefined,
        };
        pending = request;
        request.collectTimer = deps.setTimer(() => {
          request.collecting = false;
          void prompt(request);
        }, COLLECT_MS);
        request.giveUpTimer = deps.setTimer(() => {
          // Also closes a chooser nobody answered; the late answer is ignored.
          finish(request, "");
        }, GIVE_UP_MS);
      } else {
        pending.callback = callback;
        pending.devices = devices;
      }
      const request = pending;
      if (savedDevice) {
        finish(request, savedDevice.deviceId);
      } else if (!request.collecting) {
        void prompt(request);
      }
    },
    /** Cancel any scan in progress, for example when the window closes. */
    cancel() {
      if (pending) finish(pending, "");
    },
    /** Pairing confirmation: a native prompt naming the device the user already picked. */
    async confirmPairing(deviceId: string) {
      return (await deps.choose([names.get(deviceId) ?? UNKNOWN_DEVICE]).catch(() => -1)) === 0;
    },
  };
}
