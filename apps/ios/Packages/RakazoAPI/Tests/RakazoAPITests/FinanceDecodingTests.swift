import Foundation
import Testing

@testable import RakazoAPI

private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
  try JSONDecoder().decode(RPCEnvelope<T>.self, from: loadFixture(named: name)).json
}

@Test
func decodesFinanceOverview() throws {
  let o = try decode(FinanceOverview.self, "finance-overview")
  #expect(o.cashCents == 153_322_065)
  #expect(o.monthlyBurnCents == 6_762_116)
  #expect(o.runwayMonths == 22.7)
  #expect(o.sources.count == 2)
  #expect(o.isConnected)
  #expect(o.upcoming.count == 3)
  #expect(o.agentBotID != nil)
  #expect(o.excludedNonUsdCount == 1)
}

@Test
func decodesFinanceAccountsWithOtherCurrency() throws {
  let a = try decode(FinanceAccounts.self, "finance-accounts")
  #expect(a.totalCashCents == 153_322_065)
  #expect(a.cash.count == 5)
  #expect(a.cards.last?.currency == "EUR")
}

@Test
func decodesFinanceBurnAndSpend() throws {
  let b = try decode(FinanceBurn.self, "finance-burn")
  #expect(b.series.count == 12)
  let s = try decode(FinanceSpend.self, "finance-spend")
  #expect(s.totalCents == 7_888_423)
  #expect(s.categories.first?.label == "Payroll")
  #expect(s.transactions.count == 3)
  #expect(s.transactions[1].status == "pending")
}

@Test
func decodesFinanceTransactionWithoutAccount() throws {
  let d = try decode(FinanceTransactionDetail.self, "finance-transaction")
  #expect(d.transaction.counterparty == "Skyline Air (Mock)")
  #expect(d.account == nil)
  #expect(d.transaction.cardLastFour == "0001")
}
