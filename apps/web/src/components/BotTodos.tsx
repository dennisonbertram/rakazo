import { Trans, useLingui } from "@lingui/react/macro";
import type { WaitingOnYouItem } from "@rakazo/contracts";
import { Checkbox } from "@rakazo/ui-web";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";
import { ScratchpadItemMeta } from "../pages/ScratchpadSection";

/**
 * Open to-dos the person's bots saved for them, or that are past due. Hidden when there are none
 * or loading fails. `hideDueBetween` leaves out items already drawn on a calendar grid.
 */
export function BotTodos({ hideDueBetween }: { hideDueBetween?: { from: Date; to: Date } }) {
  const { t } = useLingui();
  const headingId = useId();
  const [items, setItems] = useState<WaitingOnYouItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => rpc.scratchpad.waitingOnYou({}))
      .then((next) => live && setItems(next))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const shown = items.filter((item) => {
    if (!hideDueBetween || !item.dueAt) return true;
    const due = new Date(item.dueAt);
    return due < hideDueBetween.from || due >= hideDueBetween.to;
  });
  if (shown.length === 0) return null;

  const done = (item: WaitingOnYouItem) => {
    setError("");
    rpc.scratchpad
      .update({ itemId: item.id, status: "done" })
      .then(() => setItems((all) => all.filter((entry) => entry.id !== item.id)))
      .catch(() => setError(t`Could not update`));
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mb-3 rounded-xl border border-border px-3.5 py-1"
    >
      <h2 id={headingId} className="py-2 text-xs font-semibold text-muted-foreground">
        <Trans>Waiting on you</Trans>
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul>
        {shown.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 border-t border-border py-1.5">
            <Checkbox
              aria-label={item.title}
              checked={false}
              onCheckedChange={() => done(item)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <Link to={`/app/${item.botId}`} dir="auto" className="text-sm hover:underline">
                {item.title}
              </Link>
              <span className="ms-2 text-xs text-muted-foreground/80">{item.botName}</span>
              <ScratchpadItemMeta item={item} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
