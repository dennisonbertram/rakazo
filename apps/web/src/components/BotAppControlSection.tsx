import { Trans, useLingui } from "@lingui/react/macro";
import type { AppControlApp, BotAppControl, UpdateBotAppControl } from "@rakazo/contracts";
import { APP_CONTROL_MAX_APPS } from "@rakazo/contracts";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
} from "@rakazo/ui-web";
import { Plus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { desktopBridge } from "../lib/desktop";
import { rpc } from "../lib/rpc";

type Status = Awaited<ReturnType<typeof rpc.appControl.status>>;

/**
 * Bot settings, Advanced: let the bot use chosen apps on the owner's own computer
 * (docs/local-desktop-control). Renders nothing outside the desktop app, when the server does
 * not offer app control to this user, or for a bot that runs on this Mac.
 */
export function BotAppControlSection({
  value,
  onChange,
  runsOnThisMac,
  defaultMenuOpen,
}: {
  value: BotAppControl;
  onChange: (patch: UpdateBotAppControl) => void;
  runsOnThisMac: boolean;
  defaultMenuOpen?: boolean;
}) {
  const { t } = useLingui();
  const ids = useId();
  const desktop = desktopBridge();
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState<AppControlApp[] | null>(null);
  useEffect(() => {
    if (!desktop) return;
    void rpc.appControl
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [desktop]);
  const loadRunning = () =>
    rpc.appControl
      .apps()
      .then((result) => setRunning(result.apps))
      .catch(() => setRunning([]));
  useEffect(() => {
    if (defaultMenuOpen) void loadRunning();
  }, [defaultMenuOpen]);
  const allowed = new Set(value.apps.map((app) => app.id.toLowerCase()));
  const addable = (running ?? []).filter((app) => !allowed.has(app.id.toLowerCase()));
  if (!desktop || !status?.available || runsOnThisMac) return null;

  return (
    <div className="mt-4" data-testid="bot-app-control">
      <label
        htmlFor={`${ids}-enabled`}
        className="flex cursor-pointer items-center justify-between gap-3 text-[14px] text-foreground/75 pointer-coarse:min-h-11"
      >
        {desktop.platform === "darwin" ? (
          <Trans>Use apps on this Mac</Trans>
        ) : (
          <Trans>Use apps on this computer</Trans>
        )}
        <Switch
          id={`${ids}-enabled`}
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </label>
      {value.enabled ? (
        <div className="mt-3 ms-2 border-s border-border ps-4">
          {status.accessibility === "denied" ? (
            <p className="text-[13px] text-muted-foreground">
              <Trans>
                Allow Praci in System Settings &gt; Privacy &amp; Security &gt; Accessibility.
              </Trans>
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {value.apps.map((app) => (
                  <li
                    key={app.id}
                    className="flex items-center justify-between gap-2 text-[14px] text-foreground"
                  >
                    <span className="truncate">{app.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t`Remove ${app.name}`}
                      onClick={() =>
                        onChange({ apps: value.apps.filter((entry) => entry.id !== app.id) })
                      }
                    >
                      <X size={14} aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
              <DropdownMenu
                defaultOpen={defaultMenuOpen}
                onOpenChange={(open) => {
                  // Apps open now change between visits, so look again each time.
                  if (!open) return;
                  setRunning(null);
                  void loadRunning();
                }}
              >
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={value.apps.length >= APP_CONTROL_MAX_APPS}
                    />
                  }
                >
                  <Plus size={14} aria-hidden="true" />
                  <Trans>Add app</Trans>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-56">
                  {addable.map((app) => (
                    <DropdownMenuItem
                      key={app.id}
                      onClick={() => onChange({ apps: [...value.apps, app] })}
                    >
                      {app.name}
                    </DropdownMenuItem>
                  ))}
                  {running !== null && addable.length === 0 ? (
                    <DropdownMenuItem disabled>
                      <Trans>No other open apps</Trans>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <label
            htmlFor={`${ids}-headed`}
            className="mt-4 flex cursor-pointer items-center justify-between gap-3 text-[14px] text-foreground/75 pointer-coarse:min-h-11"
          >
            <Trans>Use real mouse and keyboard</Trans>
            <Switch
              id={`${ids}-headed`}
              checked={value.headed}
              onCheckedChange={(headed) => onChange({ headed })}
            />
          </label>
          {value.headed ? (
            <p className="text-[12.5px] text-muted-foreground">
              <Trans>Moves your pointer and takes focus.</Trans>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
