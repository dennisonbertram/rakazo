import { useEffect, useRef, useState } from "react";
import { rpc } from "../lib/rpc";

export function McpOAuthCallbackPage() {
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // The authorization code is single-use; StrictMode must not replay the exchange.
    if (startedRef.current) return;
    startedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError("Missing authorization code or state.");
      setStatus("error");
      return;
    }
    rpc.capabilities
      .oauthComplete({ code, state })
      .then(() => {
        setStatus("done");
        window.close();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not complete authorization");
        setStatus("error");
      });
  }, []);

  return (
    <div className="grid min-h-full place-items-center bg-[#050506] px-6">
      <div className="w-[440px] rounded-[20px] border border-[#26262A] bg-[#121214] p-6 text-center">
        <h2 className="text-[22px] font-medium text-[#F1F1F2]">MCP authorization</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-[#85858A]">
          {status === "pending"
            ? "Completing authorization…"
            : status === "done"
              ? "Connected. You can close this tab."
              : (error ?? "Could not complete authorization")}
        </p>
      </div>
    </div>
  );
}
