import { t } from "@lingui/core/macro";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@rakazo/ui-web";
import { Eye, EyeOff } from "lucide-react";
import { setHideAmounts, useHideAmounts } from "../lib/hide-amounts-preference";

/** The scope in one sentence, shared by the tooltip and the menu row. */
export const hideMoneyTooltip = (hidden: boolean) =>
  `${hidden ? `${t`Money is hidden.`} ` : ""}${t`Hides dollar amounts and what is computed from them, such as runway and burn charts. Ownership percentages and share counts stay visible.`}`;

/** Button for page headers. Pressed while money is hidden. The text collapses to the icon below 640px. */
export function HideAmountsButton() {
  const hidden = useHideAmounts();
  const label = hidden ? t`Show money` : t`Hide money`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-sm:w-7 max-sm:px-0 pointer-coarse:h-10 max-sm:pointer-coarse:w-10"
            aria-label={label}
            aria-pressed={hidden}
            data-testid="hide-amounts-toggle"
            onClick={() => setHideAmounts(!hidden)}
          />
        }
      >
        {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {/* min-w fits the longer label ("Money hidden") so the header does not shift when toggled. */}
        <span className="sr-only sm:not-sr-only sm:min-w-[12ch] sm:text-start">
          {hidden ? t`Money hidden` : t`Hide money`}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hideMoneyTooltip(hidden)}</TooltipContent>
    </Tooltip>
  );
}

/** Account-menu row, so the switch is reachable from anywhere. */
export function HideAmountsMenuItem({ onDone }: { onDone?: () => void }) {
  const hidden = useHideAmounts();
  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start py-1.5 font-normal whitespace-normal"
      aria-pressed={hidden}
      data-testid="hide-amounts-menu-item"
      onClick={() => {
        setHideAmounts(!hidden);
        onDone?.();
      }}
    >
      {hidden ? (
        <EyeOff className="text-muted-foreground" strokeWidth={1.75} />
      ) : (
        <Eye className="text-muted-foreground" strokeWidth={1.75} />
      )}
      <span className="flex min-w-0 flex-col items-start text-start">
        <span>{hidden ? t`Show money` : t`Hide money`}</span>
        {/* The menu is narrow; the header button's tooltip carries the full caveats. */}
        <span className="text-xs text-muted-foreground">
          {hidden
            ? t`Dollar amounts and what is computed from them are hidden.`
            : t`Hides dollar amounts and what is computed from them.`}
        </span>
      </span>
    </Button>
  );
}
