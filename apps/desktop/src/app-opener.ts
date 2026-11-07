type OpenOnce = (targetUrl: string, switching: boolean) => Promise<boolean>;

/**
 * Keeps one app open in flight. A launch or reopen joins it. A server switch
 * never adopts another open's result (that open may be for a different server
 * and accepts the web app's error screen), so it fails while one is running.
 */
export function createAppOpener(openOnce: OpenOnce) {
  let inFlight: Promise<boolean> | null = null;
  return {
    busy: () => inFlight !== null,
    open(targetUrl: string, { switching = false } = {}): Promise<boolean> {
      if (inFlight !== null) return switching ? Promise.resolve(false) : inFlight;
      inFlight = openOnce(targetUrl, switching).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

export function reloadRestoredAppWindow(window: {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    reload(): void;
  };
}) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return false;
  window.webContents.reload();
  return true;
}
