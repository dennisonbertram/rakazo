import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { Link } from "react-router-dom";
import { usePhone } from "./ListControls";

/** Rows past which a phone shows "See all"; a long inline table is a long scroll there. */
export const PHONE_ROWS = 3;

/**
 * The rows an inline list shows: `phone` of them on a phone, `desktop` on wider screens (all of
 * them when it is not set). Pair it with `SeeAll`, which shows the rest.
 */
export function useCappedRows<T>(
  rows: readonly T[],
  { phone = PHONE_ROWS, desktop }: { phone?: number; desktop?: number } = {},
) {
  const isPhone = usePhone();
  const [expanded, setExpanded] = useState(false);
  const cap = isPhone ? phone : desktop;
  const capped = cap !== undefined && rows.length > cap;
  return {
    rows: rows.slice(0, capped && !expanded ? cap : undefined),
    total: rows.length,
    capped,
    expanded,
    toggle: () => setExpanded((value) => !value),
  };
}

/**
 * "See all (N)" under a capped list. With `to` a phone opens that page (so it can search, filter
 * and sort); a wider screen, or a list with no `to`, expands in place and offers "Show less".
 * `desktop="link"` makes the link the answer on wide screens too, for lists that can grow without
 * bound.
 */
export function SeeAll({
  list,
  to,
  desktop = "expand",
  className = "",
}: {
  list: Pick<ReturnType<typeof useCappedRows>, "capped" | "total" | "expanded" | "toggle">;
  to?: string;
  desktop?: "expand" | "link";
  className?: string;
}) {
  const phone = usePhone();
  if (!list.capped) return null;
  const style = `text-xs text-muted-foreground hover:text-foreground hover:underline ${className}`;
  if (to && (phone || desktop === "link")) {
    return (
      <Link to={to} className={style}>
        <Trans>See all ({list.total})</Trans>
      </Link>
    );
  }
  return (
    <button type="button" className={style} onClick={list.toggle}>
      {list.expanded ? <Trans>Show less</Trans> : <Trans>See all ({list.total})</Trans>}
    </button>
  );
}
