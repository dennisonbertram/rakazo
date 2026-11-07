import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { ScannerState } from "@rakazo/contracts";
import { isScannerFolderPath } from "@rakazo/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@rakazo/ui-web";
import { Ellipsis, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";
import { PAGE_GUTTER_X } from "../components/PageHeader";
import { desktopBridge } from "../lib/desktop";
import { SCANNER_RETRY } from "../lib/scanner-delivery";
import { errorText } from "../lib/user-error";
import { DataRoomPage } from "./DataRoom";

export function ScannerPage({
  spaceName,
  onAskAgent,
}: {
  spaceName?: string;
  onAskAgent?: () => void;
}) {
  const scanner = desktopBridge()?.scanner;
  const [state, setState] = useState<ScannerState>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [folder, setFolder] = useState("");
  useEffect(() => {
    if (!scanner) return;
    let live = true;
    const unsubscribe = scanner.onState((next) => live && setState(next));
    void scanner
      .state()
      .then((next) => live && setState(next))
      .catch(() => live && setError(t`Could not read scanner status`));
    return () => {
      live = false;
      unsubscribe();
    };
  }, [scanner]);
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause, t`Scanner request failed`));
    } finally {
      setPending(false);
    }
  };
  const status =
    state?.kind === "ready"
      ? t`Ready`
      : state?.kind === "scanning"
        ? t`Scanning…`
        : state?.kind === "not-found"
          ? t`No scanner found`
          : state?.kind === "sane-missing"
            ? t`SANE not installed`
            : state?.kind === "busy"
              ? t`Scanner busy`
              : state?.kind === "error"
                ? t`Scan failed`
                : t`Connecting…`;
  const scanning = state?.kind === "scanning";
  return (
    <>
      <DataRoomPage
        source="scan"
        spaceName={spaceName}
        onAskAgent={onAskAgent}
        headerMeta={scanner ? <span role="status">{status}</span> : undefined}
        headerActions={
          scanner ? (
            <>
              {scanning ? (
                <Button variant="outline" onClick={() => void run(() => scanner.cancel())}>
                  <Trans>Cancel scan</Trans>
                </Button>
              ) : (
                <Button
                  disabled={pending || !state || !["ready", "error"].includes(state.kind)}
                  onClick={() => void run(() => scanner.scan())}
                >
                  <ScanLine aria-hidden="true" />
                  <Trans>Scan</Trans>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" aria-label={t`Scanner settings`} />}
                >
                  <Ellipsis aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuCheckboxItem
                    checked={state?.autoScan ?? false}
                    disabled={!state || pending}
                    onCheckedChange={(enabled) => void run(() => scanner.setAutoScan(enabled))}
                  >
                    <Trans>Auto-scan</Trans>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuItem
                    disabled={!state || pending}
                    onClick={() => {
                      setFolder(state?.folder.join("/") ?? "Scans");
                      setEditingFolder(true);
                    }}
                  >
                    <Trans>Destination…</Trans>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.dispatchEvent(new Event(SCANNER_RETRY))}>
                    <Trans>Retry pending scans</Trans>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
        beforeList={
          scanner && (error || state?.error || scanning) ? (
            <div className={`${PAGE_GUTTER_X} pb-3 text-sm`}>
              {error || state?.error ? (
                <p role="alert" className="text-destructive">
                  {error || state?.error}
                </p>
              ) : (
                <p role="status" className="text-muted-foreground">
                  <Trans>Scanning pages…</Trans>
                </p>
              )}
            </div>
          ) : undefined
        }
      />
      {scanner && (
        <Dialog open={editingFolder} onOpenChange={setEditingFolder}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <Trans>Scan destination</Trans>
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const path = folder.trim() ? folder.split("/").map((part) => part.trim()) : [];
                if (!isScannerFolderPath(path)) {
                  setError(t`Enter a valid folder path`);
                  return;
                }
                void run(async () => {
                  await scanner.setFolder(path);
                  setEditingFolder(false);
                });
              }}
            >
              <label htmlFor="scanner-folder" className="mb-2 block text-sm">
                <Trans>Folder</Trans>
              </label>
              <Input
                id="scanner-folder"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                placeholder="Scans"
                autoFocus
              />
              {error && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingFolder(false)}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button type="submit" disabled={pending}>
                  <Trans>Save</Trans>
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
