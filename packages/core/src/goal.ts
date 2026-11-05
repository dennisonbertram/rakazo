export const GOAL_TEXT_MAX = 2000;

/** Fixed limits for one goal; they reset when a paused goal resumes. */
export const GOAL_LIMITS = {
  continuations: 25,
  wallMs: 4 * 60 * 60 * 1000,
  spendUsd: 5,
  stalls: 3,
} as const;

export type GoalCommand =
  | { kind: "set"; text: string }
  | { kind: "show" }
  | { kind: "clear" }
  | { kind: "too_long" };

/** `/goal`, `/goal clear` or `/goal <text>` at the start of a message; anything else is not a command. */
export function parseGoalCommand(text: string): GoalCommand | null {
  const match = /^\s*\/goal(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  if (!rest) return { kind: "show" };
  if (rest.toLowerCase() === "clear") return { kind: "clear" };
  return rest.length > GOAL_TEXT_MAX ? { kind: "too_long" } : { kind: "set", text: rest };
}
