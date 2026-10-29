import Foundation
import Observation
import RakazoAPI

private struct SpendInput: Encodable, Sendable { let period: String }
private struct TransactionInput: Encodable, Sendable { let id: String }
private struct HideAmountsUpdate: Encodable, Sendable { let hideAmounts: Bool }

struct FinanceData: Sendable {
  let overview: FinanceOverview
  let accounts: FinanceAccounts
  let burn: FinanceBurn
}

enum FinancePeriod: String, CaseIterable, Identifiable {
  case week, month, quarter, year
  var id: String { rawValue }
}

@MainActor
@Observable
final class FinanceModel {
  var state: Loadable<FinanceData> = .idle
  var spend: FinanceSpend?
  var period: FinancePeriod = .month
  var hideAmounts = false
  /// Set when a sync or a change could not be saved; the previous figures stay on screen.
  var errorMessage: String?

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      async let overview: FinanceOverview = app.call("finance/overview")
      async let accounts: FinanceAccounts = app.call("finance/accounts")
      async let burn: FinanceBurn = app.call("finance/burn")
      async let profile: Me = app.call("me")
      let data = try await FinanceData(overview: overview, accounts: accounts, burn: burn)
      hideAmounts = try await profile.hideAmounts
      state = .loaded(data)
      errorMessage = nil
      await loadSpend(app)
    } catch {
      if state.value == nil { state = .failed(error.localizedDescription) } else {
        errorMessage = error.localizedDescription
      }
    }
  }

  func loadSpend(_ app: AppModel) async {
    do {
      spend = try await app.call("finance/spend", input: SpendInput(period: period.rawValue))
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  /// Pull to refresh: sync the providers, then reload. A failed sync keeps the figures.
  func refresh(_ app: AppModel) async {
    do {
      let _: OKResult = try await app.call("finance/refresh", timeout: 60)
    } catch {
      errorMessage = error.localizedDescription
    }
    let failed = errorMessage
    await load(app)
    if let failed, errorMessage == nil { errorMessage = failed }
  }

  /// Flips the switch at once and puts it back if the server refuses.
  func setHideAmounts(_ value: Bool, _ app: AppModel) async {
    let previous = hideAmounts
    hideAmounts = value
    do {
      let profile: Me = try await app.call("preferences/update", input: HideAmountsUpdate(hideAmounts: value))
      hideAmounts = profile.hideAmounts
    } catch {
      hideAmounts = previous
      errorMessage = error.localizedDescription
    }
  }

  func transaction(_ id: String, _ app: AppModel) async throws -> FinanceTransactionDetail {
    try await app.call("finance/transaction", input: TransactionInput(id: id))
  }
}
