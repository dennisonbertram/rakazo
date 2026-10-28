import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { authClient } from "../lib/auth";
import { fetchAuthCapabilities } from "../lib/auth-capabilities";
import { passkeyCancelled, passkeysAvailable } from "../lib/passkey-support";
import { authErrorText } from "../lib/user-error";

/** Add, list and remove passkeys. Renders nothing where passkeys cannot work. */
export function PasskeySettings() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchAuthCapabilities()
      .then((capabilities) => {
        if (active) setSupported(passkeysAvailable(capabilities.passkey));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  if (!supported) return null;
  return <PasskeyList />;
}

function PasskeyList() {
  const { t } = useLingui();
  const fallback = t`Could not continue`;
  const passkeys = authClient.useListPasskeys();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(call: () => Promise<{ error: unknown }>) {
    setPending(true);
    setError(null);
    try {
      const result = await call();
      if (result.error && !passkeyCancelled(result.error)) {
        setError(authErrorText(result.error, fallback));
      }
    } catch {
      setError(fallback);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium text-foreground">
          <Trans>Passkeys</Trans>
        </h3>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void run(() => authClient.passkey.addPasskey())}
        >
          <Trans>Add passkey</Trans>
        </Button>
      </div>
      {passkeys.data?.length ? (
        <ul className="mt-2 divide-y divide-border">
          {passkeys.data.map((passkey) => {
            const label = passkey.name || t`Passkey`;
            return (
              <li key={passkey.id} className="flex items-center justify-between gap-3 py-2">
                <p className="min-w-0 text-[14px] text-foreground/75">
                  <span className="block truncate">{label}</span>
                  <span className="block text-[13px] text-muted-foreground/70">
                    {new Date(passkey.createdAt).toLocaleDateString()}
                  </span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={t`Remove passkey ${label}`}
                  onClick={() =>
                    void run(() => authClient.passkey.deletePasskey({ id: passkey.id }))
                  }
                >
                  <Trans>Remove</Trans>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
