import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@rakazo/db";
import type { EncryptedSecretStore } from "./secrets.js";

/**
 * Native Google/Gmail integration, ported from pi-google's installed-app OAuth
 * design: PKCE + offline access against a Desktop OAuth client (loopback
 * redirect URIs accept any 127.0.0.1 port), refresh tokens in the encrypted
 * secret store, and a minimal Gmail REST client for search/read.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Everything the built-in Google integration asks for, read-only. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/meetings.space.readonly",
];
const SECRET_KIND = "google-oauth";

type Actor = { workspaceId: string; userId: string };

type StoredTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  /** Space-separated scopes Google actually granted, from the token response. */
  scope?: string;
  obtainedAt: number;
};

type Pending = { verifier: string; redirectUri: string; actor: Actor };

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export class GoogleAuthBroker {
  private readonly pending = new Map<string, Pending>();
  private readonly refreshing = new Map<string, Promise<string | undefined>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: EncryptedSecretStore,
    private readonly clientId: string,
    private readonly clientSecret?: string,
  ) {}

  get configured(): boolean {
    return Boolean(this.clientId);
  }

  async status(actor: Actor): Promise<"none" | "connected" | "reconnect"> {
    const row = await this.secretRow(actor);
    if (!row) return "none";
    try {
      const tokens = JSON.parse(this.secrets.load(row.ciphertext, row.id)) as StoredTokens;
      // Tokens saved before scope tracking carry no scope field; treat those as
      // fully granted rather than forcing everyone to reconnect.
      if (typeof tokens.scope === "string" && tokens.scope.length > 0) {
        const granted = new Set(tokens.scope.split(/\s+/));
        if (GOOGLE_SCOPES.some((scope) => !granted.has(scope))) return "reconnect";
      }
      return "connected";
    } catch {
      return "reconnect";
    }
  }

  begin(actor: Actor, redirectUri: string): { authorizationUrl: string; state: string } {
    if (!this.configured) throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID)");
    const verifier = base64url(randomBytes(32));
    const state = base64url(randomBytes(16));
    this.pending.set(state, { verifier, redirectUri, actor });
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      state,
      code_challenge: base64url(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    return { authorizationUrl: `${GOOGLE_AUTH_URL}?${params}`, state };
  }

  async complete(actor: Actor, state: string, code: string): Promise<void> {
    const pending = this.pending.get(state);
    if (
      !pending ||
      pending.actor.userId !== actor.userId ||
      pending.actor.workspaceId !== actor.workspaceId
    ) {
      throw new Error("Google OAuth session is invalid or expired");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectUri,
      client_id: this.clientId,
      code_verifier: pending.verifier,
    });
    if (this.clientSecret) body.set("client_secret", this.clientSecret);
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error(
        `Google token exchange failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
      );
    }
    const tokens = (await response.json()) as StoredTokens;
    await this.saveTokens(actor, { ...tokens, obtainedAt: Date.now() });
    this.pending.delete(state);
  }

  async disconnect(actor: Actor): Promise<void> {
    const row = await this.secretRow(actor);
    if (!row) return;
    try {
      const tokens = JSON.parse(this.secrets.load(row.ciphertext, row.id)) as StoredTokens;
      const token = tokens.refresh_token ?? tokens.access_token;
      if (token) {
        await fetch(GOOGLE_REVOKE_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        }).catch(() => undefined);
      }
    } catch {
      // Revocation is best-effort; the stored secret is removed regardless.
    }
    await this.prisma.secret.delete({ where: { id: row.id } });
  }

  /** Valid access token, refreshing (and persisting the rotation) when stale.
      Concurrent callers share one refresh request. */
  async accessToken(actor: Actor): Promise<string | undefined> {
    const key = `${actor.workspaceId}:${actor.userId}`;
    const inFlight = this.refreshing.get(key);
    if (inFlight) return inFlight;
    const task = this.accessTokenInner(actor).finally(() => this.refreshing.delete(key));
    this.refreshing.set(key, task);
    return task;
  }

  private async accessTokenInner(actor: Actor): Promise<string | undefined> {
    const row = await this.secretRow(actor);
    if (!row) return undefined;
    let tokens: StoredTokens;
    try {
      tokens = JSON.parse(this.secrets.load(row.ciphertext, row.id)) as StoredTokens;
    } catch {
      return undefined;
    }
    const expiresAt = tokens.obtainedAt + (tokens.expires_in ?? 3600) * 1000;
    if (Date.now() < expiresAt - 60_000) return tokens.access_token;
    if (!tokens.refresh_token) return tokens.access_token;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: this.clientId,
    });
    if (this.clientSecret) body.set("client_secret", this.clientSecret);
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error(
        `Google token refresh failed (${response.status}); reconnect Google from Plugins`,
      );
    }
    const refreshed = (await response.json()) as StoredTokens;
    const next: StoredTokens = {
      ...tokens,
      ...refreshed,
      refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
      scope: refreshed.scope ?? tokens.scope,
      obtainedAt: Date.now(),
    };
    await this.saveTokens(actor, next, row.id);
    return next.access_token;
  }

  /** Authorized GET against any Google API, shared by all service clients. */
  async apiGet(actor: Actor, url: string): Promise<Record<string, unknown>> {
    const token = await this.accessToken(actor);
    if (!token) throw new Error("Google is not connected. Connect Google (built-in) from Plugins.");
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Google API ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { __raw: text };
    }
  }

  /** Authorized GET returning the raw body (Drive exports / downloads). */
  async apiGetText(actor: Actor, url: string): Promise<string> {
    const token = await this.accessToken(actor);
    if (!token) throw new Error("Google is not connected. Connect Google (built-in) from Plugins.");
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Google API ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return response.text();
  }

  private async secretRow(actor: Actor) {
    return this.prisma.secret.findFirst({
      where: { workspaceId: actor.workspaceId, userId: actor.userId, kind: SECRET_KIND },
    });
  }

  private async saveTokens(actor: Actor, tokens: StoredTokens, existingId?: string): Promise<void> {
    const stored = await this.secrets.put(JSON.stringify(tokens), {
      operationId: "google.oauth",
      traceId: "google.oauth",
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      signal: new AbortController().signal,
    });
    await this.prisma.$transaction([
      this.prisma.secret.create({
        data: {
          id: stored.id,
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          kind: SECRET_KIND,
          ciphertext: stored.ciphertext,
        },
      }),
      ...(existingId ? [this.prisma.secret.delete({ where: { id: existingId } })] : []),
    ]);
  }
}

export type GmailHeaderSummary = {
  id: string;
  threadId: string;
  date: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
};

function header(headers: { name?: string; value?: string }[] | undefined, name: string): string {
  return headers?.find((entry) => entry.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf-8");
}

/** Depth-first search for the first text/plain (fallback text/html) body part. */
export function extractBodyText(payload: unknown): string {
  const stack: Record<string, unknown>[] =
    payload && typeof payload === "object" ? [payload as Record<string, unknown>] : [];
  let html = "";
  while (stack.length > 0) {
    const part = stack.shift()!;
    const mime = String(part.mimeType ?? "");
    const data = (part.body as { data?: string } | undefined)?.data;
    if (data && mime.startsWith("text/plain")) return decodeBase64Url(data);
    if (data && mime.startsWith("text/html") && !html) html = decodeBase64Url(data);
    const parts = part.parts;
    if (Array.isArray(parts)) stack.push(...(parts as Record<string, unknown>[]));
  }
  return html
    .replaceAll(/<style[\s\S]*?<\/style>/gi, "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export class GmailNative {
  constructor(private readonly broker: GoogleAuthBroker) {}

  async connected(actor: Actor): Promise<boolean> {
    return (await this.broker.status(actor)) === "connected";
  }

  private async request(actor: Actor, path: string): Promise<Record<string, unknown>> {
    const token = await this.broker.accessToken(actor);
    if (!token) throw new Error("Google is not connected. Connect Gmail (built-in) from Plugins.");
    const response = await fetch(`${GMAIL_API}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Gmail API ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  async list(
    actor: Actor,
    input: { q?: string; pageToken?: string; maxResults?: number },
  ): Promise<{ ids: { id: string; threadId: string }[]; nextPageToken?: string }> {
    const params = new URLSearchParams();
    if (input.q) params.set("q", input.q);
    if (input.pageToken) params.set("pageToken", input.pageToken);
    params.set("maxResults", String(Math.min(500, Math.max(1, input.maxResults ?? 100))));
    const data = await this.request(actor, `/messages?${params}`);
    const messages = Array.isArray(data.messages)
      ? (data.messages as { id: string; threadId: string }[])
      : [];
    return {
      ids: messages,
      nextPageToken: typeof data.nextPageToken === "string" ? data.nextPageToken : undefined,
    };
  }

  async metadata(actor: Actor, id: string): Promise<GmailHeaderSummary> {
    const data = await this.request(
      actor,
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    const payload = data.payload as { headers?: { name?: string; value?: string }[] } | undefined;
    return {
      id: String(data.id ?? id),
      threadId: String(data.threadId ?? ""),
      date: header(payload?.headers, "Date"),
      from: header(payload?.headers, "From"),
      to: header(payload?.headers, "To"),
      subject: header(payload?.headers, "Subject"),
      snippet: String(data.snippet ?? ""),
    };
  }

  async full(actor: Actor, id: string): Promise<GmailHeaderSummary & { body: string }> {
    const data = await this.request(actor, `/messages/${id}?format=full`);
    const payload = data.payload as { headers?: { name?: string; value?: string }[] } | undefined;
    return {
      id: String(data.id ?? id),
      threadId: String(data.threadId ?? ""),
      date: header(payload?.headers, "Date"),
      from: header(payload?.headers, "From"),
      to: header(payload?.headers, "To"),
      subject: header(payload?.headers, "Subject"),
      snippet: String(data.snippet ?? ""),
      body: extractBodyText(data.payload).slice(0, 20_000),
    };
  }

  /** Hydrate metadata for many ids with bounded concurrency. */
  async metadataMany(actor: Actor, ids: string[], concurrency = 8): Promise<GmailHeaderSummary[]> {
    const results: GmailHeaderSummary[] = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
      while (cursor < ids.length) {
        const index = cursor;
        cursor += 1;
        const id = ids[index];
        if (!id) break;
        try {
          results.push(await this.metadata(actor, id));
        } catch {
          // A single failed hydration must not sink the dump; coverage reports totals.
        }
      }
    });
    await Promise.all(workers);
    return results;
  }
}

/** High-recall dump collection over the native client (mirrors mail-dump.ts). */
export async function collectNativeMailDump(
  gmail: GmailNative,
  actor: Actor,
  queries: string[],
  maxMessages: number,
): Promise<{
  records: {
    id: string;
    threadId: string;
    timestamp: string;
    from: string;
    to: string;
    subject: string;
    preview: string;
  }[];
  summaries: { query: string; found: number; pages: number; capped: boolean; error?: string }[];
  cappedTotal: boolean;
}> {
  const ids = new Map<string, string>();
  const summaries: {
    query: string;
    found: number;
    pages: number;
    capped: boolean;
    error?: string;
  }[] = [];
  let cappedTotal = false;
  for (const query of queries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 10)) {
    const summary = { query, found: 0, pages: 0, capped: false } as (typeof summaries)[number];
    summaries.push(summary);
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      if (ids.size >= maxMessages) {
        cappedTotal = true;
        summary.capped = true;
        break;
      }
      try {
        const result = await gmail.list(actor, { q: query, pageToken, maxResults: 500 });
        summary.pages += 1;
        for (const ref of result.ids) {
          if (ids.size >= maxMessages && !ids.has(ref.id)) {
            cappedTotal = true;
            summary.capped = true;
            break;
          }
          ids.set(ref.id, ref.threadId);
          summary.found += 1;
        }
        pageToken = result.nextPageToken;
      } catch (error) {
        summary.error = error instanceof Error ? error.message : String(error);
        break;
      }
      if (!pageToken || summary.capped) break;
    }
  }
  const hydrated = await gmail.metadataMany(actor, [...ids.keys()]);
  const records = hydrated.map((entry) => ({
    id: entry.id,
    threadId: entry.threadId,
    timestamp: entry.date,
    from: entry.from,
    to: entry.to,
    subject: entry.subject,
    preview: entry.snippet,
  }));
  return { records, summaries, cappedTotal };
}

export function gmailSummaryLine(summary: GmailHeaderSummary): string {
  const clean = (value: string) => value.replaceAll(/\s+/g, " ").trim();
  return [
    clean(summary.date),
    clean(summary.from),
    clean(summary.to),
    clean(summary.subject) || "(no subject)",
    clean(summary.snippet).slice(0, 200),
    `id=${summary.id}`,
    `thread=${summary.threadId}`,
  ].join(" | ");
}
