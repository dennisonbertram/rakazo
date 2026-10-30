import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { PageSource } from "@rakazo/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rakazo/ui-web";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

function statusBadge(source: PageSource): {
  label: string;
  variant: "secondary" | "destructive" | "outline";
} {
  if (source.lastError) return { label: t`failed`, variant: "destructive" };
  switch (source.status) {
    case "active":
      return { label: t`ok`, variant: "secondary" };
    case "pending":
      return { label: t`pending`, variant: "outline" };
    case "paused":
      return { label: t`paused`, variant: "outline" };
    case "denied":
      return { label: t`denied`, variant: "outline" };
  }
}

function refreshedText(at: string | null): string {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
}

/** The page's saved data sources. Removing one leaves blocks that read it showing "Source not found". */
export function PageSourcesDialog({
  botId,
  pageId,
  open,
  onOpenChange,
  onChanged,
}: {
  botId: string;
  pageId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a source was removed, so the page can reload its data. */
  onChanged: () => void;
}) {
  const [sources, setSources] = useState<PageSource[]>();
  const [removing, setRemoving] = useState<PageSource>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let live = true;
    setError("");
    void rpc.pages
      .sources({ botId, pageId })
      .then((list: PageSource[]) => live && setSources(list))
      .catch((cause: unknown) => live && setError(errorText(cause)));
    return () => {
      live = false;
    };
  }, [open, botId, pageId]);

  const remove = async () => {
    if (!removing) return;
    try {
      await rpc.pages.removeSource({ botId, sourceId: removing.id });
      setSources((list) => list?.filter((source) => source.id !== removing.id));
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    }
    setRemoving(undefined);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              <Trans>Sources</Trans>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {error ? (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {sources?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Trans>No sources</Trans>
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(sources ?? []).map((source) => {
                  const badge = statusBadge(source);
                  return (
                    <li key={source.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{source.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{source.call.tool}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {refreshedText(source.lastRefreshAt)}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t`${source.name} options`}
                            >
                              <MoreHorizontal size={16} />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRemoving(source)}
                          >
                            <Trans>Remove</Trans>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={removing !== undefined}
        onOpenChange={(next) => !next && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              <Trans>Remove {removing?.name}?</Trans>
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              <Trans>Remove</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
