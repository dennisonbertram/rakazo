const SCANNER_SESSION_TIMEOUT_MS = 5_000;

export interface ScannerSessionResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export interface ScannerSessionVerification {
  origin: string;
  userId: string;
  spaceId: string;
  fetch: (input: string, init: RequestInit) => Promise<ScannerSessionResponse>;
  isCurrent: () => boolean;
}

function isTrustedOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      url.origin === origin
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function verifyScannerSessionScope(
  verification: ScannerSessionVerification,
): Promise<boolean> {
  if (!isTrustedOrigin(verification.origin) || !verification.isCurrent()) return false;
  try {
    const response = await verification.fetch(`${verification.origin}/rpc/me`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rakazo-space-id": verification.spaceId,
      },
      body: JSON.stringify({ json: null }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(SCANNER_SESSION_TIMEOUT_MS),
    });
    if (!response.ok || !verification.isCurrent()) return false;
    const payload = await response.json();
    if (!verification.isCurrent() || !isRecord(payload) || !isRecord(payload.json)) return false;
    return (
      payload.json.userId === verification.userId &&
      payload.json.spaceId === verification.spaceId &&
      verification.isCurrent()
    );
  } catch {
    return false;
  }
}

export function isScannerSessionCookie(cookie: { domain?: string; name: string }, origin: string) {
  try {
    if (cookie.domain === undefined) return false;
    const hostname = new URL(origin).hostname.toLowerCase();
    const domain = cookie.domain.replace(/^\./, "").toLowerCase();
    const matchesOrigin = hostname === domain || hostname.endsWith(`.${domain}`);
    return matchesOrigin && /(?:^|[._-])session(?:_token|_data)?$/i.test(cookie.name);
  } catch {
    return false;
  }
}
