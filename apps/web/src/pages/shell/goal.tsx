import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageBlock, ThreadGoal, ThreadSnapshot } from "@rakazo/contracts";
import { ThreadGoalSchema } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { CircleAlert, CircleStop, Target, X } from "lucide-react";
import { useState } from "react";
import { SuccessPop } from "../../components/ai/primitives";

/** The one-line goal status above the composer: the goal text, plus a status word when the bot is not working. */
export function GoalLine({
  goal,
  waiting,
  onClear,
}: {
  goal: ThreadGoal;
  /** The goal's run waits on a card or question for the owner. */
  waiting: boolean;
  onClear: () => void;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const status = goal.status === "paused" ? t`Paused` : waiting ? t`Waiting on you` : null;
  return (
    <div
      role="group"
      aria-label={t`Goal`}
      data-testid="goal-line"
      className="mb-2 flex items-start gap-2 rounded-[14px] border border-border bg-muted py-1 ps-3 pe-1 text-[13px]"
    >
      <Target
        aria-hidden="true"
        size={14}
        strokeWidth={1.8}
        className="mt-[7px] shrink-0 text-muted-foreground"
      />
      <button
        type="button"
        aria-expanded={expanded}
        title={goal.text}
        onClick={() => setExpanded((open) => !open)}
        className="min-w-0 flex-1 rounded-sm py-1 text-start text-foreground"
      >
        <span
          dir="auto"
          className={expanded ? "block whitespace-pre-wrap break-words" : "block truncate"}
        >
          {goal.text}
        </span>
      </button>
      {status ? <span className="shrink-0 py-1 text-muted-foreground">{status}</span> : null}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t`Clear goal`}
        className="shrink-0"
        onClick={onClear}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/** How a goal ended, in the transcript: one word after "Goal", then the reason. */
export function GoalBlockView({ block }: { block: Extract<MessageBlock, { kind: "goal" }> }) {
  const { t } = useLingui();
  const title =
    block.outcome === "met"
      ? t`Goal met`
      : block.outcome === "blocked"
        ? t`Goal blocked`
        : t`Goal stopped`;
  return (
    <div
      role="status"
      data-testid="goal-block"
      data-outcome={block.outcome}
      className="mx-auto flex max-w-full flex-col items-center gap-0.5 py-1 text-center"
    >
      {block.outcome === "met" ? (
        <SuccessPop label={title} />
      ) : (
        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          {block.outcome === "blocked" ? (
            <CircleAlert aria-hidden="true" size={16} className="text-warning" />
          ) : (
            <CircleStop aria-hidden="true" size={16} className="text-muted-foreground" />
          )}
          {title}
        </span>
      )}
      {block.reason ? (
        <span dir="auto" className="text-[13.5px] text-muted-foreground">
          {block.reason}
        </span>
      ) : null}
    </div>
  );
}

/** The server answers a bare `/goal` or `/goal clear` through a send error marked `data.goalReply`. */
export function isGoalReply(error: unknown): boolean {
  return (error as { data?: { goalReply?: unknown } } | null)?.data?.goalReply === true;
}

/** That answer as a neutral line, not an error. */
export function GoalNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useLingui();
  return (
    <div
      role="status"
      data-testid="goal-notice"
      className="mb-2 flex items-center gap-2 rounded-[14px] border border-border bg-muted py-1 ps-4 pe-1 text-[13px] text-foreground"
    >
      <span dir="auto" className="min-w-0 flex-1 py-1">
        {message}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t`Dismiss`}
        className="shrink-0"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Applies a `thread.goal.updated` payload; a payload that is not a goal or null leaves the snapshot alone. */
export function snapshotWithGoal(
  snapshot: ThreadSnapshot | null,
  payload: unknown,
): ThreadSnapshot | null {
  if (!snapshot) return snapshot;
  const raw = (payload as { goal?: unknown } | null)?.goal;
  if (raw === null) return { ...snapshot, goal: null };
  const goal = ThreadGoalSchema.safeParse(raw);
  return goal.success ? { ...snapshot, goal: goal.data } : snapshot;
}
