import RakazoAPI
import SwiftUI

struct FinanceTransactionScreen: View {
  @Environment(AppModel.self) private var app
  let id: String
  let model: FinanceModel
  let hidden: Bool
  @State private var state: Loadable<FinanceTransactionDetail> = .idle

  var body: some View {
    LoadableView(state: state, retry: { Task { await load() } }, content: { detail in
      List {
        Section {
          LabeledContent(
            "Amount",
            value: financeSignedMoney(
              detail.transaction.amountCents, currency: detail.transaction.currency,
              hidden: hidden, exact: true))
          LabeledContent("Date", value: financeDay(detail.transaction.postedAt))
          LabeledContent("Status", value: detail.transaction.status.capitalized)
          if let category = detail.transaction.category {
            LabeledContent("Category", value: category)
          }
          if let account = detail.account { LabeledContent("Account", value: account.name) }
          if let last = detail.transaction.cardLastFour {
            LabeledContent("Card", value: "•• \(last)")
          }
          if let holder = detail.transaction.cardholder {
            LabeledContent("Cardholder", value: holder)
          }
          if detail.vendorIsSubscription { LabeledContent("Subscription", value: "Yes") }
          LabeledContent("Receipt", value: detail.transaction.hasReceipt ? "Attached" : "None")
        }
        if let memo = detail.transaction.memo {
          Section("Memo") { Text(memo) }
        }
      }
      .navigationTitle(detail.vendorName ?? detail.transaction.counterparty)
    })
    .navigationBarTitleDisplayMode(.inline)
    .task { await load() }
  }

  private func load() async {
    state = .loading
    do { state = .loaded(try await model.transaction(id, app)) } catch {
      state = .failed(error.localizedDescription)
    }
  }
}
