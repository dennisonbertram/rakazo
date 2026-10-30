import type { BrexCardsList } from "@rakazo/contracts";

// Stub so the red tests fail on behavior, not on a missing module.
export function BrexCardsSection(_props: {
  cards: BrexCardsList | null;
  error: string | null;
  onRetry: () => void;
}) {
  return null;
}
