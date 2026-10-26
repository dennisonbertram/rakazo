import { Trans, useLingui } from "@lingui/react/macro";
import type { ScratchpadItem } from "@rakazo/contracts";
import { Button, Checkbox, enqueueNotificationToast, Input } from "@rakazo/ui-web";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { rpc } from "../lib/rpc";

/** "Waiting on Acme legal · due Fri"; a past-due date shows in the destructive colour. */
export function ScratchpadItemMeta({
  item,
  now = new Date(),
}: {
  item: Pick<ScratchpadItem, "waitingOn" | "dueAt">;
  now?: Date;
}) {
  const { t, i18n } = useLingui();
  if (!item.waitingOn && !item.dueAt) return null;
  const due = item.dueAt ? new Date(item.dueAt) : null;
  const days = due ? Math.abs(due.getTime() - now.getTime()) / 86_400_000 : 0;
  const dueText = due
    ? due.toLocaleDateString(
        i18n.locale || "en",
        days < 6 ? { weekday: "short" } : { month: "short", day: "numeric" },
      )
    : null;
  const waitingOn = item.waitingOn;
  const pastDue = due !== null && due.getTime() < now.getTime();
  return (
    <div className="mt-0.5 text-[12.5px] text-muted-foreground/80" dir="auto">
      {item.waitingOn ? t`Waiting on ${waitingOn}` : null}
      {item.waitingOn && dueText ? " · " : null}
      {dueText ? (
        <span className={pastDue ? "text-destructive" : undefined}>{t`due ${dueText}`}</span>
      ) : null}
    </div>
  );
}

export function ScratchpadSection({
  botId,
  refreshKey = 0,
}: {
  botId: string;
  /** Changes when a run ends, so items the bot added in chat show up without a reload. */
  refreshKey?: number;
}) {
  const { t } = useLingui();
  const [items, setItems] = useState<ScratchpadItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listGeneration = useRef(0);

  async function refresh() {
    const generation = ++listGeneration.current;
    const list = await rpc.scratchpad.list({ botId, includeDone: true });
    if (generation !== listGeneration.current) return;
    setItems(list);
  }

  useEffect(() => {
    const generation = ++listGeneration.current;
    void rpc.scratchpad
      .list({ botId, includeDone: true })
      .then((list) => {
        if (generation !== listGeneration.current) return;
        setItems(list);
      })
      .catch(() => {
        if (generation !== listGeneration.current) return;
        setItems([]);
      });
    return () => {
      listGeneration.current += 1;
    };
  }, [botId]);

  const lastRefreshKey = useRef(refreshKey);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh only reads botId and refs
  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    void refresh().catch(() => undefined);
  }, [refreshKey]);

  async function addItem() {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await rpc.scratchpad.create({ botId, title });
      setDraft("");
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      try {
        await refresh();
      } catch {
        setError(t`Saved, but list refresh failed`);
      }
    } catch {
      setError(t`Could not add`);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(item: ScratchpadItem, status: ScratchpadItem["status"]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rpc.scratchpad.update({ itemId: item.id, status });
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      if (status === "done") {
        const title = item.title;
        enqueueNotificationToast({
          id: `scratchpad-${item.id}-${Date.now()}`,
          title: t`Completed ${title}`,
          action: {
            label: t`Undo`,
            onClick: () => {
              void rpc.scratchpad
                .update({ itemId: item.id, status: item.status })
                .then(() => refresh())
                .catch(() => setError(t`Could not update`));
            },
          },
        });
      }
      try {
        await refresh();
      } catch {
        setError(t`Saved, but list refresh failed`);
      }
    } catch {
      setError(t`Could not update`);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: ScratchpadItem) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.scratchpad.remove({ itemId: item.id });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      try {
        await refresh();
      } catch {
        setError(t`Removed, but list refresh failed`);
      }
    } catch {
      setError(t`Could not remove`);
    } finally {
      setBusy(false);
    }
  }

  const openItems = items.filter((item) => item.status !== "done");
  const doneItems = items.filter((item) => item.status === "done");
  const doneCount = doneItems.length;

  return (
    <div className="mt-6" data-testid="bot-scratchpad">
      <div className="mb-3 text-[13.5px] font-medium text-foreground">
        <Trans>Open work</Trans>
      </div>
      {openItems.length === 0 ? (
        <div className="py-1 text-[13.5px] text-muted-foreground/80">
          <Trans>None yet</Trans>
        </div>
      ) : (
        openItems.map((item) => (
          <div
            key={item.id}
            className="flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 hover:bg-accent"
          >
            <Checkbox
              aria-label={t`Complete`}
              checked={false}
              disabled={busy}
              onCheckedChange={() => void setStatus(item, "done")}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="text-start text-[14.5px] text-foreground" dir="auto">
                {item.title}
              </div>
              <ScratchpadItemMeta item={item} />
              {item.notes ? (
                <div className="mt-0.5 text-[12.5px] text-muted-foreground/80" dir="auto">
                  {item.notes}
                </div>
              ) : null}
            </div>
            <span className="shrink-0 text-[12px] text-muted-foreground/80">{item.status}</span>
            {item.status === "open" ? (
              <Button
                variant="ghost"
                size="xs"
                aria-label={t`Park`}
                disabled={busy}
                onClick={() => void setStatus(item, "parked")}
                className="shrink-0 text-muted-foreground/70"
              >
                <Trans>Park</Trans>
              </Button>
            ) : item.status === "parked" ? (
              <Button
                variant="ghost"
                size="xs"
                aria-label={t`Reopen`}
                disabled={busy}
                onClick={() => void setStatus(item, "open")}
                className="shrink-0 text-muted-foreground/70"
              >
                <Trans>Reopen</Trans>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t`Remove`}
              disabled={busy}
              onClick={() => void removeItem(item)}
              className="shrink-0 text-muted-foreground/70"
            >
              <X />
            </Button>
          </div>
        ))
      )}
      {doneItems.length > 0 ? (
        <details className="group mt-3" data-testid="bot-scratchpad-done">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg text-[13px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Trans>Done ({doneCount})</Trans>
            <ChevronDown
              aria-hidden
              className="size-3.5 transition-transform group-open:rotate-180"
            />
          </summary>
          {doneItems.map((item) => (
            <div key={item.id} className="flex w-full items-start gap-2 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] text-muted-foreground line-through" dir="auto">
                  {item.title}
                </div>
                {item.resolvedReason ? (
                  <div className="mt-0.5 text-[12.5px] text-muted-foreground/80" dir="auto">
                    {item.resolvedReason}
                  </div>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => void setStatus(item, "open")}
                className="shrink-0 text-muted-foreground/70"
              >
                <Trans>Reopen</Trans>
              </Button>
            </div>
          ))}
        </details>
      ) : null}
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void addItem();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t`Add item`}
          aria-label={t`New open-work item`}
          maxLength={200}
          className="min-w-0 flex-1"
        />
        <Button
          variant="secondary"
          className="rounded-full"
          disabled={busy || !draft.trim()}
          onClick={() => void addItem()}
        >
          <Trans>Add</Trans>
        </Button>
      </form>
      {error ? <div className="mt-2 text-[13px] text-destructive">{error}</div> : null}
    </div>
  );
}
