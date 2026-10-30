import type { SecretStore } from "@rakazo/adapter-kit";
import type { HttpSourceCall } from "@rakazo/contracts";
import { HttpSourceCallSchema } from "@rakazo/contracts";
import type { ActionApprovalRule } from "@rakazo/core";
import { resolveActionApprovalDetail } from "@rakazo/core";
import { urlSite } from "@rakazo/core/egress";
import type { PrismaClient } from "@rakazo/db";
import { listApprovalRules } from "@rakazo/db";
import { findBotSecret, requestWithBotSecret } from "./bot-secrets.js";
import type { RemoteTransportDependencies } from "./remote-mcp.js";
import { fetchSafeWebBytes, isBlockedHostname } from "./web-ssrf.js";

export const HTTP_SOURCE_MAX_BYTES = 1_000_000;
export const HTTP_SOURCE_CSV_MAX_ROWS = 5_000;
export const HTTP_SOURCE_CSV_MAX_COLUMNS = 50;
const TIMEOUT_MS = 15_000;

type Scope = { spaceId: string; botId: string; userId: string };

/** A message safe to show the owner or the model: fixed words, no response content. */
export class HttpSourceError extends Error {}

/**
 * The checks the fetch applies, minus DNS (made at fetch time): the shape of the URL and a
 * private or internal host written out in it. Returns the parsed call, or the reason it is refused.
 */
export function checkHttpSourceCall(input: unknown): HttpSourceCall | string {
  const parsed = HttpSourceCallSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "The request is not valid.";
  const url = new URL(parsed.data.url);
  if (isBlockedHostname(url.hostname.replace(/^\[|\]$/g, ""))) {
    return "The URL targets a private or internal host.";
  }
  return parsed.data;
}

/**
 * Why this call may not run now, or null: a Block rule for the URL's site (same resolution as
 * web_fetch), a secret that is gone or unusable, or a secret saved for another origin.
 */
export async function httpSourceRefusal(
  prisma: PrismaClient,
  scope: Scope,
  call: HttpSourceCall,
): Promise<string | null> {
  const rules = (await listApprovalRules(prisma, scope)) as ActionApprovalRule[];
  const site = urlSite(call.url);
  const resolved = resolveActionApprovalDetail({
    toolName: "web_fetch",
    viaConnector: false,
    site,
    rules,
    botId: scope.botId,
  });
  if (resolved.decision === "block") return "A Block rule covers this site.";
  if (call.secret) {
    const secret = await findBotSecret(prisma, scope, call.secret);
    if (!secret) return `There is no saved key named "${call.secret}".`;
    if (secret.auth.type === "login" || secret.auth.type === "command") {
      return `The key "${call.secret}" cannot be sent in a request.`;
    }
    if (secret.origin !== new URL(call.url).origin) {
      return `The key "${call.secret}" is saved for a different site (${secret.origin}).`;
    }
  }
  return null;
}

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** RFC 4180-ish: quoted fields, "" for a quote, CR/LF/CRLF rows. Plain integers and decimals become numbers. */
export function parseCsv(text: string): Record<string, string | number>[] {
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let any = false;
  const endField = () => {
    row.push(field);
    field = "";
    if (row.length > HTTP_SOURCE_CSV_MAX_COLUMNS) {
      throw new HttpSourceError(`The CSV has more than ${HTTP_SOURCE_CSV_MAX_COLUMNS} columns.`);
    }
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== "") table.push(row);
    row = [];
    any = false;
    if (table.length > HTTP_SOURCE_CSV_MAX_ROWS + 1) {
      throw new HttpSourceError(`The CSV has more than ${HTTP_SOURCE_CSV_MAX_ROWS} rows.`);
    }
  };
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string;
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && field === "") {
      quoted = true;
      any = true;
    } else if (char === ",") {
      endField();
      any = true;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else {
      field += char;
      any = true;
    }
  }
  if (quoted) throw new HttpSourceError("The CSV has an unclosed quote.");
  if (any || field !== "") endRow();
  const [header, ...rows] = table;
  if (!header) throw new HttpSourceError("The CSV is empty.");
  return rows.map((cells) =>
    Object.fromEntries(
      header.map((name, index) => {
        const cell = cells[index] ?? "";
        return [name, NUMBER.test(cell) ? Number(cell) : cell];
      }),
    ),
  );
}

function statusError(status: number): HttpSourceError {
  return status >= 300 && status < 400
    ? new HttpSourceError("The API redirected; update the source URL.")
    : new HttpSourceError(`The API returned ${status}.`);
}

function parseBody(accept: "json" | "csv", body: unknown): unknown {
  if (accept === "csv") {
    if (typeof body !== "string") throw new HttpSourceError("The response is not CSV.");
    return parseCsv(body);
  }
  if (typeof body === "string") throw new HttpSourceError("The response is not JSON.");
  return body;
}

export interface HttpSourceRunDeps {
  prisma: PrismaClient;
  secretStore?: SecretStore;
  network?: RemoteTransportDependencies;
}

/**
 * One GET of an approved http source. `beforeSend` runs as the last step before the request goes
 * out and throws when the approval no longer holds. Errors carry fixed text only: never a response
 * body or header.
 */
export async function runHttpSource(
  deps: HttpSourceRunDeps,
  scope: Scope,
  call: HttpSourceCall,
  beforeSend: () => Promise<void>,
): Promise<unknown> {
  if (call.secret) {
    if (!deps.secretStore) throw new HttpSourceError("Saved keys are not available.");
    let stopped: unknown;
    const result = (await requestWithBotSecret({
      prisma: deps.prisma,
      secretStore: deps.secretStore,
      scope,
      request: { name: call.secret, url: call.url, method: "GET" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      remote: deps.network,
      maxOutputChars: HTTP_SOURCE_MAX_BYTES,
      beforeSend: () =>
        beforeSend().catch((error: unknown) => {
          stopped = error;
          throw error;
        }),
    }).catch(() => ({ error: "The request failed." }))) as {
      error?: string;
      redirected?: boolean;
      status?: number;
      body?: unknown;
      truncated?: boolean;
    };
    if (stopped) throw stopped;
    if (result.redirected) throw statusError(302);
    if (typeof result.status !== "number") {
      throw new HttpSourceError(
        result.error?.startsWith("This credential cannot")
          ? "The key cannot be sent to that URL."
          : "The request failed.",
      );
    }
    if (result.status < 200 || result.status >= 300) throw statusError(result.status);
    if (result.truncated) throw new HttpSourceError("The response is larger than 1 MB.");
    return parseBody(call.accept, result.body);
  }
  await beforeSend();
  let response: Awaited<ReturnType<typeof fetchSafeWebBytes>>;
  try {
    response = await fetchSafeWebBytes(call.url, {
      method: "GET",
      maxRedirects: 0,
      timeoutMs: TIMEOUT_MS,
      maxBytes: HTTP_SOURCE_MAX_BYTES,
      headers: { accept: call.accept === "csv" ? "text/csv" : "application/json" },
      fetch: deps.network?.fetch,
      resolveHostname: deps.network?.resolveHostname,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /HTTP (\d{3})/.exec(message)?.[1];
    if (status) throw statusError(Number(status));
    if (message === "Too many redirects") throw statusError(302);
    if (message === "Response is too large") {
      throw new HttpSourceError("The response is larger than 1 MB.");
    }
    if (/private|internal/.test(message)) {
      throw new HttpSourceError("The URL targets a private or internal host.");
    }
    throw new HttpSourceError("The request failed.");
  }
  const text = new TextDecoder().decode(response.body);
  if (call.accept === "csv") return parseCsv(text);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpSourceError("The response is not JSON.");
  }
}
