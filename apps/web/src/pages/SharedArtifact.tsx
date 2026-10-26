import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { ArtifactPreview } from "../components/ArtifactPreview";
import { artifactDisplayName } from "../lib/artifact-name";
import { decodeArtifactBase64 } from "../lib/artifact-open";
import { openSharedArtifact } from "../lib/shared-artifact";

type State =
  | { status: "loading" }
  | { status: "gone" }
  | { status: "ready"; name: string; mimeType: string; bytes: Uint8Array };

/**
 * A shared artifact, view only. The link token is in the URL fragment, which browsers never send,
 * so it reaches the server only in the body of the one request below. No Shell, no app session.
 */
export function SharedArtifactPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) {
      setState({ status: "gone" });
      return;
    }
    let cancelled = false;
    void openSharedArtifact(token)
      .then((shared) => {
        if (cancelled) return;
        setState({
          status: "ready",
          name: shared.name,
          mimeType: shared.mimeType,
          bytes: decodeArtifactBase64(shared.contentBase64),
        });
      })
      .catch(() => !cancelled && setState({ status: "gone" }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "gone") {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-4 text-sm text-muted-foreground">
        <p>{t`This link is not available.`}</p>
      </main>
    );
  }
  if (state.status === "loading") {
    return (
      <main className="grid min-h-svh place-items-center bg-background text-sm text-muted-foreground">
        <Trans>Loading…</Trans>
      </main>
    );
  }
  return (
    <main className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex items-baseline gap-3 border-b border-border px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {artifactDisplayName(state.name)}
        </h1>
        <span className="shrink-0 text-[12.5px] text-muted-foreground">
          <Trans>Shared from Praci</Trans>
        </span>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ArtifactPreview
          artifact={{ id: "shared", name: state.name, mimeType: state.mimeType }}
          bytes={state.bytes}
        />
      </div>
    </main>
  );
}
