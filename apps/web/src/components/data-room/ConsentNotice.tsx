import { Trans } from "@lingui/react/macro";
import { ORPCError } from "@orpc/client";
import type { DataRoomConsentStatus } from "@rakazo/contracts";
import { Button, Card } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

/**
 * Asks once for the AI providers that would read the person's documents. Shows nothing when
 * allowed, when no model is set up, or while the status is unknown.
 */
export function ConsentNotice({ onAllowed }: { onAllowed: () => void }) {
  const [status, setStatus] = useState<DataRoomConsentStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      rpc.dataRoom
        .consent()
        .then(setStatus)
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (!status || status.allowed || status.recipients.length === 0) return null;
  const allow = () => {
    setPending(true);
    setError("");
    rpc.dataRoom
      .consentGrant({ key: status.key, version: status.version })
      .then(() => {
        setStatus(null);
        onAllowed();
      })
      .catch((cause) => {
        // The providers changed since this was shown; show the new ones.
        if (cause instanceof ORPCError && cause.code === "CONFLICT") return load();
        setError(errorText(cause));
      })
      .finally(() => setPending(false));
  };
  return (
    <Card size="sm" className="m-3 gap-1 px-3.5">
      <p className="text-xs text-muted-foreground">{status.disclosure}</p>
      <ul className="text-sm">
        {status.recipients.map(({ name, detail }) => (
          <li key={name}>
            {name}
            {detail ? <span className="text-muted-foreground"> {detail}</span> : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button size="sm" disabled={pending} onClick={allow}>
          <Trans>Allow</Trans>
        </Button>
      </div>
    </Card>
  );
}
