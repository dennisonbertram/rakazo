import { describe, expect, it } from "vitest";
import { financePath, parseFinanceRoute } from "./finance-route";

describe("parseFinanceRoute", () => {
  it("reads the dashboard and the list pages", () => {
    expect(parseFinanceRoute("/app/finance")).toEqual({ page: "dashboard" });
    expect(parseFinanceRoute("/app/finance/")).toEqual({ page: "dashboard" });
    expect(parseFinanceRoute("/app/finance/accounts")).toEqual({ page: "accounts" });
    expect(parseFinanceRoute("/app/finance/burn")).toEqual({ page: "burn" });
    expect(parseFinanceRoute("/app/finance/runway")).toEqual({ page: "runway" });
  });

  it("round-trips every detail path it builds", () => {
    const cases = [
      financePath.account("acc 1"),
      financePath.month("2026-09"),
      financePath.category("servers-cloud"),
      financePath.recurring("google workspace/x"),
      financePath.vendor("acme & co"),
      financePath.transaction("txn_1"),
      financePath.receipt("txn_1"),
    ];
    const parsed = cases.map((path) => parseFinanceRoute(path));
    expect(parsed).toEqual([
      { page: "account", id: "acc 1" },
      { page: "month", month: "2026-09" },
      { page: "category", slug: "servers-cloud" },
      { page: "recurring", key: "google workspace/x" },
      { page: "vendor", key: "acme & co" },
      { page: "transaction", id: "txn_1" },
      { page: "receipt", id: "txn_1" },
    ]);
  });

  it("reads the spend period and category, defaulting an unknown period to month", () => {
    expect(parseFinanceRoute("/app/finance/spend", "?period=quarter&cat=travel")).toEqual({
      page: "spend",
      period: "quarter",
      category: "travel",
    });
    expect(parseFinanceRoute("/app/finance/spend", "?period=decade")).toEqual({
      page: "spend",
      period: "month",
      category: null,
    });
    const built = new URL(financePath.spend("week", "a b"), "http://localhost");
    expect(parseFinanceRoute(built.pathname, built.search)).toEqual({
      page: "spend",
      period: "week",
      category: "a b",
    });
  });

  it("rejects unknown pages, a malformed month and extra segments", () => {
    expect(parseFinanceRoute("/app/finance/nope").page).toBe("not-found");
    expect(parseFinanceRoute("/app/finance/month/October").page).toBe("not-found");
    expect(parseFinanceRoute("/app/finance/vendor/a/b").page).toBe("not-found");
    expect(parseFinanceRoute("/app/finance/vendor/%E0%A4%A").page).toBe("not-found");
    expect(parseFinanceRoute("/app/inbox").page).toBe("not-found");
  });
});
