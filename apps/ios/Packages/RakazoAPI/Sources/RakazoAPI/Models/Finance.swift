import Foundation

/// A connected finance source (`rpc_finance_overview` `sources`).
public struct FinanceSource: Sendable, Hashable, Decodable {
  public let provider: String
  public let status: String
  public let lastSyncedAt: String?

  private enum CodingKeys: String, CodingKey { case provider, status, lastSyncedAt }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    provider = try c.decodeIfPresent(String.self, forKey: .provider) ?? ""
    status = try c.decodeIfPresent(String.self, forKey: .status) ?? "unknown"
    lastSyncedAt = try c.decodeIfPresent(String.self, forKey: .lastSyncedAt)
  }
}

/// One upcoming payment (`rpc_finance_overview` `upcoming.items`).
public struct FinanceUpcoming: Sendable, Hashable, Identifiable, Decodable {
  public let key: String
  public let name: String
  public let dates: [String]
  public let amountCents: Int
  public var id: String { key }

  private enum CodingKeys: String, CodingKey { case key, name, dates, amountCents }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    key = try c.decode(String.self, forKey: .key)
    name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
    dates = try c.decodeIfPresent([String].self, forKey: .dates) ?? []
    amountCents = try c.decodeIfPresent(Int.self, forKey: .amountCents) ?? 0
  }
}

/// `rpc_finance_overview`. Cash, burn and runway are already totalled in USD by the server.
public struct FinanceOverview: Sendable, Decodable {
  public let sources: [FinanceSource]
  public let agentBotID: String?
  public let cashCents: Int
  public let hasCashAccounts: Bool
  public let monthlyBurnCents: Int
  public let runwayMonths: Double?
  public let upcoming: [FinanceUpcoming]
  public let excludedNonUsdCount: Int
  public let lastSyncedAt: String?

  private enum CodingKeys: String, CodingKey {
    case sources, agent, cash, hasCashAccounts, burn, runway, upcoming, excludedNonUsdCount, lastSyncedAt
  }
  private enum AgentKeys: String, CodingKey { case botId }
  private enum CashKeys: String, CodingKey { case cashCents }
  private enum BurnKeys: String, CodingKey { case monthlyCents }
  private enum RunwayKeys: String, CodingKey { case months }
  private enum UpcomingKeys: String, CodingKey { case items }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    sources = try c.decodeIfPresent([FinanceSource].self, forKey: .sources) ?? []
    agentBotID = try? container.nestedContainer(keyedBy: AgentKeys.self, forKey: .agent)
      .decodeIfPresent(String.self, forKey: .botId)
    cashCents = try c.nestedContainer(keyedBy: CashKeys.self, forKey: .cash)
      .decodeIfPresent(Int.self, forKey: .cashCents) ?? 0
    hasCashAccounts = try c.decodeIfPresent(Bool.self, forKey: .hasCashAccounts) ?? false
    monthlyBurnCents = try c.nestedContainer(keyedBy: BurnKeys.self, forKey: .burn)
      .decodeIfPresent(Int.self, forKey: .monthlyCents) ?? 0
    runwayMonths = try? container.nestedContainer(keyedBy: RunwayKeys.self, forKey: .runway)
      .decodeIfPresent(Double.self, forKey: .months)
    upcoming = (try? container.nestedContainer(keyedBy: UpcomingKeys.self, forKey: .upcoming)
      .decodeIfPresent([FinanceUpcoming].self, forKey: .items)) ?? []
    excludedNonUsdCount = try c.decodeIfPresent(Int.self, forKey: .excludedNonUsdCount) ?? 0
    lastSyncedAt = try c.decodeIfPresent(String.self, forKey: .lastSyncedAt)
  }

  /// A connected source exists (even when it holds no accounts yet).
  public var isConnected: Bool { sources.contains { $0.status != "not_connected" } }
}

/// One account (`rpc_finance_accounts` `cash` / `cards`).
public struct FinanceAccount: Sendable, Hashable, Identifiable, Decodable {
  public let id: String
  public let provider: String
  public let name: String
  public let lastFour: String?
  public let kind: String
  public let balanceCents: Int
  public let currency: String

  private enum CodingKeys: String, CodingKey {
    case id, provider, name, lastFour, kind, balanceCents, currency
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    provider = try c.decodeIfPresent(String.self, forKey: .provider) ?? ""
    name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
    lastFour = try c.decodeIfPresent(String.self, forKey: .lastFour)
    kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? ""
    balanceCents = try c.decodeIfPresent(Int.self, forKey: .balanceCents) ?? 0
    currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "USD"
  }
}

/// `rpc_finance_accounts`.
public struct FinanceAccounts: Sendable, Decodable {
  public let totalCashCents: Int
  public let cash: [FinanceAccount]
  public let cards: [FinanceAccount]

  private enum CodingKeys: String, CodingKey { case totalCashCents, cash, cards }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    totalCashCents = try c.decodeIfPresent(Int.self, forKey: .totalCashCents) ?? 0
    cash = try c.decodeIfPresent([FinanceAccount].self, forKey: .cash) ?? []
    cards = try c.decodeIfPresent([FinanceAccount].self, forKey: .cards) ?? []
  }
}

/// One month of outflow (`rpc_finance_burn` `series`).
public struct FinanceBurnMonth: Sendable, Hashable, Identifiable, Decodable {
  public let month: String
  public let outCents: Int
  public let partial: Bool
  public var id: String { month }

  private enum CodingKeys: String, CodingKey { case month, outCents, partial }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    month = try c.decode(String.self, forKey: .month)
    outCents = try c.decodeIfPresent(Int.self, forKey: .outCents) ?? 0
    partial = try c.decodeIfPresent(Bool.self, forKey: .partial) ?? false
  }
}

/// `rpc_finance_burn`.
public struct FinanceBurn: Sendable, Decodable {
  public let monthlyCents: Int
  public let series: [FinanceBurnMonth]

  private enum CodingKeys: String, CodingKey { case monthlyCents, series }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    monthlyCents = try c.decodeIfPresent(Int.self, forKey: .monthlyCents) ?? 0
    series = try c.decodeIfPresent([FinanceBurnMonth].self, forKey: .series) ?? []
  }
}

/// A spend category (`rpc_finance_spend` `categories`).
public struct FinanceCategory: Sendable, Hashable, Identifiable, Decodable {
  public let key: String
  public let label: String
  public let cents: Int
  public var id: String { key }

  private enum CodingKeys: String, CodingKey { case key, label, cents }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    key = try c.decode(String.self, forKey: .key)
    label = try c.decodeIfPresent(String.self, forKey: .label) ?? key
    cents = try c.decodeIfPresent(Int.self, forKey: .cents) ?? 0
  }
}

/// A transaction (`rpc_finance_spend` `transactions`, `rpc_finance_transaction` `transaction`).
public struct FinanceTransaction: Sendable, Hashable, Identifiable, Decodable {
  public let id: String
  public let provider: String
  public let postedAt: String
  public let amountCents: Int
  public let currency: String
  public let counterparty: String
  public let category: String?
  public let status: String
  public let classification: String
  public let cardLastFour: String?
  public let cardholder: String?
  public let memo: String?
  public let hasReceipt: Bool

  private enum CodingKeys: String, CodingKey {
    case id, provider, postedAt, amountCents, currency, counterparty, category, status
    case classification, cardLastFour, cardholder, memo, hasReceipt
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    provider = try c.decodeIfPresent(String.self, forKey: .provider) ?? ""
    postedAt = try c.decodeIfPresent(String.self, forKey: .postedAt) ?? ""
    amountCents = try c.decodeIfPresent(Int.self, forKey: .amountCents) ?? 0
    currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "USD"
    counterparty = try c.decodeIfPresent(String.self, forKey: .counterparty) ?? ""
    category = try c.decodeIfPresent(String.self, forKey: .category)
    status = try c.decodeIfPresent(String.self, forKey: .status) ?? "other"
    classification = try c.decodeIfPresent(String.self, forKey: .classification) ?? "spend"
    cardLastFour = try c.decodeIfPresent(String.self, forKey: .cardLastFour)
    cardholder = try c.decodeIfPresent(String.self, forKey: .cardholder)
    memo = try c.decodeIfPresent(String.self, forKey: .memo)
    hasReceipt = try c.decodeIfPresent(Bool.self, forKey: .hasReceipt) ?? false
  }
}

/// `rpc_finance_spend`.
public struct FinanceSpend: Sendable, Decodable {
  public let period: String
  public let totalCents: Int
  public let categories: [FinanceCategory]
  public let transactions: [FinanceTransaction]

  private enum CodingKeys: String, CodingKey { case period, totalCents, categories, transactions }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    period = try c.decodeIfPresent(String.self, forKey: .period) ?? "month"
    totalCents = try c.decodeIfPresent(Int.self, forKey: .totalCents) ?? 0
    categories = try c.decodeIfPresent([FinanceCategory].self, forKey: .categories) ?? []
    transactions = try c.decodeIfPresent([FinanceTransaction].self, forKey: .transactions) ?? []
  }
}

/// `rpc_finance_transaction`.
public struct FinanceTransactionDetail: Sendable, Decodable {
  public let transaction: FinanceTransaction
  public let vendorName: String?
  public let account: FinanceAccount?
  public let vendorIsSubscription: Bool

  private enum CodingKeys: String, CodingKey {
    case transaction, vendorName, account, vendorIsSubscription
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    transaction = try c.decode(FinanceTransaction.self, forKey: .transaction)
    vendorName = try c.decodeIfPresent(String.self, forKey: .vendorName)
    account = try c.decodeIfPresent(FinanceAccount.self, forKey: .account)
    vendorIsSubscription = try c.decodeIfPresent(Bool.self, forKey: .vendorIsSubscription) ?? false
  }
}
