import { useEffect, useRef } from "react";

export const REFETCH_INTERVAL_MS = 60_000;

/**
 * Calls `refetch` while `enabled`: when the window regains focus or becomes visible, when a
 * notification arrives, and every 60 seconds. Keeps a list of server-updated state fresh
 * without a reload.
 */
export function useRefetchWhileOpen(enabled: boolean, refetch: () => void) {
  const latest = useRef(refetch);
  latest.current = refetch;
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = setInterval(run, REFETCH_INTERVAL_MS);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("rakazo:notifications-changed", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("rakazo:notifications-changed", run);
    };
  }, [enabled]);
}
