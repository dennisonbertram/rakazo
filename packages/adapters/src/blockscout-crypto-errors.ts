/** Why a Blockscout call failed. `plan` is a 402: the chain is not on the user's plan, or credits ran out. */
export type CryptoFailureKind =
  | "missing_key"
  | "rejected_key"
  | "plan"
  | "rate_limit"
  | "timeout"
  | "failed";

/** Most actionable first. */
const PRIORITY: CryptoFailureKind[] = [
  "missing_key",
  "rejected_key",
  "plan",
  "rate_limit",
  "timeout",
  "failed",
];

/** Matches the real tool errors, e.g. "...credits exhausted (HTTP 402): the API key's credit allowance is depleted...". */
export function classifyCryptoError(error: unknown): CryptoFailureKind {
  const text = error instanceof Error ? error.message : "";
  // Checked first: the 402 text also says "API key".
  if (/credits? (exhausted|allowance)|out of credits|\b402\b/i.test(text)) return "plan";
  // The server surfaces a rate limit as "429 Too Many Requests - Details: ...".
  if (/\b429\b|too many requests|rate.?limit/i.test(text)) return "rate_limit";
  if (/\b40[13]\b|unauthori[sz]ed|forbidden|reject|invalid.*api key|malformed/i.test(text))
    return "rejected_key";
  if (/session.*no longer be used|pro api key|not configured|requires? .*api key/i.test(text))
    return "missing_key";
  if (error instanceof Error && (error.name === "TimeoutError" || /timed? ?out/i.test(text)))
    return "timeout";
  return "failed";
}

/** Key problems fail every chain alike, so the sync stops calling. */
export const isKeyFailure = (kind: CryptoFailureKind): boolean =>
  kind === "missing_key" || kind === "rejected_key";

export const mostActionable = (kinds: CryptoFailureKind[]): CryptoFailureKind =>
  PRIORITY.find((k) => kinds.includes(k)) ?? "failed";

const join = (names: string[]) =>
  names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** Short, user-facing; never a vendor payload, URL or key. `chains` names the chains that failed for this reason. */
export function cryptoFailureMessage(kind: CryptoFailureKind, chains: string[] = []): string {
  const who = chains.length ? join(chains) : "Blockscout";
  switch (kind) {
    case "missing_key":
      return "Add a Blockscout API key";
    case "rejected_key":
      return "Blockscout rejected the API key";
    case "plan":
      return `${who} ${chains.length > 1 ? "need" : "needs"} a paid Blockscout plan, or your credits ran out`;
    case "rate_limit":
      return `${who}: Blockscout rate limit reached, try again shortly`;
    case "timeout":
      return `${who}: the request timed out`;
    default:
      return `${who}: the request failed`;
  }
}
