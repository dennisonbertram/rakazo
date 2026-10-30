import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// The emulator mirrors loosely typed Brex JSON; tests read and edit it directly.
export type Row = Record<string, any>;

export interface BrexApiEmulatorOptions {
  /** The one bearer token the emulator accepts. */
  token?: string;
  /** 0 picks a free port. */
  port?: number;
  /** Upper bound on `limit`, so small values exercise paging. Brex allows up to 100. */
  maxPageSize?: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  authorization: string | null;
  idempotencyKey: string | null;
  contentType: string | null;
  body: unknown;
}

export interface InjectedFailure {
  method?: string;
  path?: string;
  status: number;
  body?: unknown;
  /** Let this many matching requests through first. */
  after?: number;
}

const USD = (amount: number) => ({ amount, currency: "USD" });
const ADDRESS = {
  line1: "1 Example Way",
  city: "Springfield",
  state: "CA",
  country: "US",
  postal_code: "00000",
};
const SPEND_LIMIT_ENUMS = [
  "authorization_visibility",
  "auto_create_limit_cards_setting",
  "auto_transfer_cards_setting",
  "expense_visibility",
  "limit_increase_setting",
  "spend_type",
] as const;

const card = (id: string, name: string, lastFour: string, over: Row = {}): Row => ({
  id,
  owner: { type: "USER", user_id: "u_ada" },
  status: "ACTIVE",
  last_four: lastFour,
  card_name: name,
  card_type: "VIRTUAL",
  limit_type: "CARD",
  billing_address: ADDRESS,
  expiration_date: { month: 12, year: 2029 },
  created_at: "2026-01-05T10:00:00Z",
  ...over,
});

const spendLimit = (id: string, name: string, over: Row = {}): Row => ({
  id,
  account_id: "cmp_example",
  name,
  status: "ACTIVE",
  period_recurrence_type: "PER_MONTH",
  authorization_settings: {
    base_limit: USD(100_000),
    authorization_type: "HARD",
    rollover_refresh_rate: "OFF",
    limit_with_increases: USD(100_000),
  },
  expense_visibility: "SHARED",
  authorization_visibility: "PUBLIC",
  limit_increase_setting: "DISABLED",
  spend_type: "BUDGET_PROVISIONED_CARDS_ONLY",
  auto_transfer_cards_setting: "DISABLED",
  auto_create_limit_cards_setting: "DISABLED",
  expense_policy_id: "pol_software",
  owner_user_ids: ["u_ada"],
  member_user_ids: ["u_ada"],
  ...over,
});

const transaction = (n: number, cardId: string, amount: number, date: string): Row => ({
  id: `txn_${n}`,
  card_id: cardId,
  description: n % 2 ? "Figma" : "Example Ads",
  amount: USD(amount),
  initiated_at_date: date,
  posted_at_date: date,
  type: "PURCHASE",
  merchant: { raw_descriptor: n % 2 ? "FIGMA" : "EXAMPLE ADS", mcc: "5734", country: "US" },
  expense_id: `exp_${n}`,
});

function seed() {
  return {
    users: [
      {
        id: "u_ada",
        first_name: "Ada",
        last_name: "Example",
        email: "ada@example.test",
        status: "ACTIVE",
      },
      {
        id: "u_ben",
        first_name: "Ben",
        last_name: "Sample",
        email: "ben@example.test",
        status: "ACTIVE",
      },
      {
        id: "u_cy",
        first_name: "Cy",
        last_name: "Demo",
        email: "cy@example.test",
        status: "ACTIVE",
      },
    ] as Row[],
    cards: [
      card("card_figma", "Figma", "4242", {
        spend_controls: {
          spend_limit: USD(50_000),
          spend_duration: "MONTHLY",
          allowed_merchant_details: [{ name: "Figma" }],
        },
      }),
      card("card_ads", "Ad spend", "5555", {
        owner: { type: "USER", user_id: "u_ben" },
        spend_controls: {
          spend_limit: USD(100_000),
          spend_duration: "ONE_TIME",
          lock_after_date: "2026-12-31",
        },
      }),
      card("card_team", "Ada team card", "1111", { limit_type: "USER" }),
      card("card_eur", "Berlin tools", "2222", {
        spend_controls: {
          spend_limit: { amount: 20_000, currency: "EUR" },
          spend_duration: "MONTHLY",
        },
      }),
    ] as Row[],
    spendLimits: [
      // The template differs from the settings the server forces, so a copy is observable.
      spendLimit("sl_template", "Software template", {
        expense_visibility: "PRIVATE",
        authorization_visibility: "PRIVATE",
        limit_increase_setting: "ENABLED",
        spend_type: "NON_BUDGET_PROVISIONED_CARDS_ALLOWED",
      }),
      spendLimit("sl_soft", "Soft travel", {
        authorization_settings: {
          base_limit: USD(100_000),
          authorization_type: "SOFT",
          rollover_refresh_rate: "OFF",
        },
      }),
      spendLimit("sl_auto", "Everyone", { auto_create_limit_cards_setting: "ALL_MEMBERS" }),
      spendLimit("sl_buffered", "Buffered limit", {
        authorization_settings: {
          base_limit: USD(100_000),
          limit_buffer_percentage: 10,
          authorization_type: "HARD",
          rollover_refresh_rate: "OFF",
        },
      }),
    ] as Row[],
    expenses: [
      {
        id: "exp_1",
        memo: null,
        status: "SUBMITTED",
        payment_status: "CLEARED",
        user_id: "u_ada",
        purchased_at: "2026-10-02T10:00:00Z",
        billing_amount: USD(1200),
        merchant: { raw_descriptor: "FIGMA", mcc: "5734", country: "US" },
        _compliance: "DUE",
      },
      {
        id: "exp_2",
        memo: "Team seats",
        status: "APPROVED",
        payment_status: "CLEARED",
        user_id: "u_ada",
        purchased_at: "2026-10-05T10:00:00Z",
        billing_amount: USD(4500),
        merchant: { raw_descriptor: "EXAMPLE ADS", mcc: "7311", country: "US" },
        _compliance: "COMPLIANT",
      },
      {
        id: "exp_3",
        memo: null,
        status: "SUBMITTED",
        payment_status: "CLEARED",
        user_id: "u_ben",
        purchased_at: "2026-10-09T10:00:00Z",
        billing_amount: USD(900),
        merchant: { raw_descriptor: "FIGMA", mcc: "5734", country: "US" },
        _compliance: "OVERDUE",
      },
    ] as Row[],
    transactions: [
      transaction(1, "card_figma", 1200, "2026-10-02"),
      transaction(2, "card_ads", 4500, "2026-10-05"),
      transaction(3, "card_figma", 1200, "2026-10-12"),
      transaction(4, "card_ads", 2500, "2026-10-19"),
      transaction(5, "card_figma", 1200, "2026-10-26"),
    ] as Row[],
    trips: [
      {
        id: "trip_1",
        name: "Example offsite",
        status: "UPCOMING",
        booker_user_id: "u_ada",
        starts_at: "2026-12-01T09:00:00Z",
        ends_at: "2026-12-04T17:00:00Z",
        version: 1,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
    ] as Row[],
    cashAccounts: [
      // Fake numbers: the package must never return them.
      {
        id: "ca_1",
        name: "Operating",
        status: "ACTIVE",
        current_balance: USD(1_234_500),
        available_balance: USD(1_200_000),
        account_number: "000123456789",
        routing_number: "000000000",
        primary: true,
      },
    ] as Row[],
    cardStatements: [
      {
        id: "st_card_1",
        start_balance: USD(0),
        end_balance: USD(31_000),
        period: { start_date: "2026-09-01", end_date: "2026-09-30" },
      },
      {
        id: "st_card_2",
        start_balance: USD(31_000),
        end_balance: USD(52_000),
        period: { start_date: "2026-10-01", end_date: "2026-10-31" },
      },
    ] as Row[],
    cashStatements: [
      {
        id: "st_cash_1",
        start_balance: USD(1_000_000),
        end_balance: USD(1_234_500),
        period: { start_date: "2026-10-01", end_date: "2026-10-31" },
      },
    ] as Row[],
  };
}

/**
 * Offline stand-in for the parts of the Brex REST API this package calls (team, budgets,
 * expenses, transactions and travel). Field names follow the Brex OpenAPI specs. Seeded with
 * invented data. It has no `/pan`, `secure_email` or `unlock` route: those answer 404 and are
 * recorded in `requests`, so a test can prove they are never called.
 */
export class BrexApiEmulator {
  readonly token: string;
  /** Respond 429 (Retry-After: 1) to this many next requests. */
  rateLimitNext = 0;
  /** Answer matching requests with this failure, once each. */
  readonly failNext: InjectedFailure[] = [];
  readonly requests: RecordedRequest[] = [];
  readonly company: Row = {
    id: "cmp_example",
    legal_name: "Example Co",
    mailing_address: ADDRESS,
    accountType: "BREX_EMPOWER",
  };
  /** Expense policies a spend limit may reference. */
  readonly policyIds = new Set(["pol_software"]);
  readonly users: Row[];
  readonly cards: Row[];
  readonly spendLimits: Row[];
  readonly expenses: Row[];
  readonly transactions: Row[];
  readonly trips: Row[];
  readonly cashAccounts: Row[];
  readonly cardStatements: Row[];
  readonly cashStatements: Row[];
  private server: ReturnType<typeof createServer> | undefined;
  private readonly maxPageSize: number;
  private readonly port: number;
  private readonly replays = new Map<string, [number, unknown]>();
  private sequence = 0;

  constructor(options: BrexApiEmulatorOptions = {}) {
    this.token = options.token ?? "bxt_emulator_token";
    this.maxPageSize = options.maxPageSize ?? 100;
    this.port = options.port ?? 0;
    ({
      users: this.users,
      cards: this.cards,
      spendLimits: this.spendLimits,
      expenses: this.expenses,
      transactions: this.transactions,
      trips: this.trips,
      cashAccounts: this.cashAccounts,
      cardStatements: this.cardStatements,
      cashStatements: this.cashStatements,
    } = seed());
  }

  /** Starts listening on 127.0.0.1 and returns the base URL (no trailing slash). */
  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://emulator.test");
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw) : undefined;
        } catch {
          body = undefined;
        }
        const [status, payload, headers] = this.handle(req.method ?? "GET", url, req.headers, body);
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(payload));
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(this.port, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  }

  private handle(
    method: string,
    url: URL,
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): [number, unknown, Record<string, string>?] {
    const header = (name: string) =>
      typeof headers[name] === "string" ? (headers[name] as string) : null;
    const path = url.pathname;
    this.requests.push({
      method,
      path,
      query: url.search,
      authorization: header("authorization"),
      idempotencyKey: header("idempotency-key"),
      contentType: header("content-type"),
      body,
    });
    if (header("authorization") !== `Bearer ${this.token}`) return [401, { error: "unauthorized" }];
    if (this.rateLimitNext > 0) {
      this.rateLimitNext -= 1;
      return [429, { error: "too_many_requests" }, { "retry-after": "1" }];
    }
    const injected = this.failNext.findIndex(
      (f) => (!f.method || f.method === method) && (!f.path || f.path === path),
    );
    const failure = this.failNext[injected];
    if (failure && (failure.after ?? 0) > 0) failure.after = (failure.after ?? 0) - 1;
    else if (failure) {
      this.failNext.splice(injected, 1);
      return [failure.status, failure.body ?? { error: "injected" }];
    }

    const key = header("idempotency-key");
    const replayKey = key && method !== "GET" ? `${method} ${path} ${key}` : undefined;
    const replay = replayKey ? this.replays.get(replayKey) : undefined;
    if (replay) return [replay[0], structuredClone(replay[1])];
    const result = this.route(method, url, body);
    if (replayKey && result[0] === 200)
      this.replays.set(replayKey, [result[0], structuredClone(result[1])]);
    return result;
  }

  private route(method: string, url: URL, body: unknown): [number, unknown] {
    const q = url.searchParams;
    const b = (body ?? {}) as Row;
    const parts = url.pathname.split("/").filter(Boolean);
    const [v, a, c, d] = parts;
    const at = (list: Row[], id: string | undefined) => list.find((row) => row.id === id);
    const found = (row: Row | undefined): [number, unknown] =>
      row ? [200, row] : [404, { error: "not_found" }];

    if (v === "v2" && a === "cards") {
      if (parts.length === 2 && method === "GET")
        return this.page(
          this.cards.filter((x) => !q.get("user_id") || x.owner?.user_id === q.get("user_id")),
          q,
        );
      if (parts.length === 2 && method === "POST") return this.createCard(b);
      const target = at(this.cards, c);
      if (parts.length === 3 && method === "GET") return found(target);
      if (parts.length === 3 && method === "PUT" && target) {
        target.spend_controls = { ...target.spend_controls, ...b.spend_controls };
        return [200, target];
      }
      if (
        parts.length === 4 &&
        method === "POST" &&
        target &&
        (d === "lock" || d === "terminate")
      ) {
        if (!b.reason) return [400, { error: "reason_required" }];
        target.status = d === "lock" ? "LOCKED" : "TERMINATED";
        return [200, target];
      }
    }
    if (v === "v2" && a === "users" && method === "GET") {
      if (c === "me") return found(this.users[0]);
      if (parts.length === 3) return found(at(this.users, c));
      const emails = q.getAll("email[]").flatMap((e) => e.split(","));
      const name = q.get("name")?.toLowerCase();
      return this.page(
        this.users
          .filter((u) => !emails.length || emails.includes(u.email))
          .filter(
            (u) =>
              !name || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(name),
          ),
        q,
      );
    }
    if (v === "v2" && a === "company" && method === "GET") return [200, this.company];
    if (v === "v2" && a === "spend_limits") {
      if (parts.length === 2 && method === "GET") {
        const members = q.getAll("member_user_id[]");
        return this.page(
          this.spendLimits.filter(
            (x) => !members.length || members.some((m) => x.member_user_ids.includes(m)),
          ),
          q,
        );
      }
      if (parts.length === 2 && method === "POST") return this.createSpendLimit(b);
      const target = at(this.spendLimits, c);
      if (parts.length === 3 && method === "GET") return found(target);
      if (parts.length === 3 && method === "PUT" && target) return this.updateSpendLimit(target, b);
    }
    if (v === "v1" && a === "expenses" && c === "card") {
      if (parts.length === 3 && method === "GET") {
        const wanted = q.getAll("compliance_status[]");
        const users = q.getAll("user_id[]");
        const rows = this.expenses
          .filter((x) => !wanted.length || wanted.includes(x._compliance))
          .filter((x) => !users.length || users.includes(x.user_id))
          .map(({ _compliance, ...rest }) => rest);
        return this.page(rows, q);
      }
      const target = at(this.expenses, d);
      if (parts.length === 4 && method === "PUT" && target) {
        if (typeof b.memo === "string") target.memo = b.memo;
        const { _compliance, ...rest } = target;
        return [200, rest];
      }
    }
    if (v === "v2" && a === "transactions" && c === "card" && d === "primary" && method === "GET") {
      const since = q.get("posted_at_start");
      const owners = q.getAll("user_ids");
      const expand = q.getAll("expand[]").includes("expense_id");
      const rows = this.transactions
        .filter((x) => !since || Date.parse(x.posted_at_date) >= Date.parse(since))
        .filter((x) => !owners.length || owners.includes(at(this.cards, x.card_id)?.owner?.user_id))
        .map(({ expense_id, ...rest }) => (expand ? { ...rest, expense_id } : rest));
      return this.page(rows, q);
    }
    if (v === "v1" && a === "trips" && parts.length === 2 && method === "GET")
      return this.page(this.trips, q);
    if (v === "v2" && a === "accounts" && method === "GET") {
      if (c === "cash" && parts.length === 3) return this.page(this.cashAccounts, q);
      if (c === "card" && d === "primary" && parts[4] === "statements")
        return this.page(this.cardStatements, q);
      if (c === "cash" && at(this.cashAccounts, d) && parts[4] === "statements")
        return this.page(this.cashStatements, q);
    }
    return [404, { error: "not_found" }];
  }

  private page(rows: Row[], q: URLSearchParams): [number, unknown] {
    const size = Math.min(Number(q.get("limit")) || 100, this.maxPageSize);
    const start = q.has("cursor") ? Number(Buffer.from(q.get("cursor") ?? "", "base64url")) : 0;
    if (!Number.isInteger(start) || start < 0) return [400, { error: "bad_cursor" }];
    const next = start + size;
    return [
      200,
      {
        items: rows.slice(start, next),
        next_cursor: next < rows.length ? Buffer.from(String(next)).toString("base64url") : null,
      },
    ];
  }

  private createCard(b: Row): [number, unknown] {
    for (const field of ["owner", "card_name", "card_type", "limit_type"])
      if (!b[field]) return [400, { error: `${field}_required` }];
    if (!this.users.some((u) => u.id === b.owner?.user_id))
      return [400, { error: "unknown_owner" }];
    if (
      b.limit_type === "CARD" &&
      !(b.spend_controls?.spend_limit && b.spend_controls?.spend_duration)
    )
      return [400, { error: "spend_controls_required" }];
    const n = ++this.sequence;
    const created = card(`card_new_${n}`, b.card_name, String(7000 + n), {
      owner: b.owner,
      card_type: b.card_type,
      limit_type: b.limit_type,
      ...(b.spend_controls ? { spend_controls: b.spend_controls } : {}),
    });
    this.cards.push(created);
    return [200, created];
  }

  private createSpendLimit(b: Row): [number, unknown] {
    const settings = b.authorization_settings;
    for (const field of [
      "name",
      "period_recurrence_type",
      "authorization_settings",
      ...SPEND_LIMIT_ENUMS,
    ])
      if (!b[field]) return [400, { error: `${field}_required` }];
    if (!(settings.base_limit && settings.authorization_type && settings.rollover_refresh_rate))
      return [400, { error: "authorization_settings_incomplete" }];
    if (!b.expense_policy_id || !this.policyIds.has(b.expense_policy_id))
      return [400, { error: "unknown_expense_policy" }];
    const created = spendLimit(`sl_new_${++this.sequence}`, b.name, {
      ...b,
      authorization_settings: { ...settings, limit_with_increases: settings.base_limit },
      owner_user_ids: b.owner_user_ids ?? [],
      member_user_ids: b.member_user_ids ?? [],
    });
    this.spendLimits.push(created);
    return [200, created];
  }

  private updateSpendLimit(target: Row, b: Row): [number, unknown] {
    if (b.expense_policy_id && !this.policyIds.has(b.expense_policy_id))
      return [400, { error: "unknown_expense_policy" }];
    const { authorization_settings: settings, ...rest } = b;
    Object.assign(target, rest);
    if (settings) Object.assign(target.authorization_settings, settings);
    return [200, target];
  }
}
