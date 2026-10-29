import RakazoAPI
import SwiftUI

struct CapTableScreen: View {
  @Environment(AppModel.self) private var app
  @State private var model = CapTableModel()

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.load(app) } }) { result in
      if let snapshot = result.snapshot {
        List {
          summary(snapshot, result)
          if !snapshot.shareClasses.isEmpty {
            Section("Share classes") {
              ForEach(snapshot.shareClasses) { c in
                LabeledContent(c.name) {
                  Text([c.shares.map { $0.formatted() }, c.percent.map { capPercent($0) }]
                    .compactMap { $0 }.joined(separator: " · "))
                }
              }
            }
          }
          Section("Holders") {
            ForEach(snapshot.holders.sortedByOwnership()) { holder in
              NavigationLink {
                HolderDetailView(holder: holder, hide: model.hideAmounts)
              } label: {
                HolderRow(holder: holder, hide: model.hideAmounts)
              }
            }
          }
        }
        .refreshable { await model.load(app) }
      } else {
        ContentUnavailableView {
          Label("See who owns your company", systemImage: "chart.pie")
        } actions: {
          Button("Connect Carta") { app.showingSettings = true }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("connectCarta")
        }
      }
    }
    .navigationTitle("Cap table")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        if let id = model.agentID {
          Button { app.open(.thread(.bot(id))) } label: {
            Label("Ask Carta agent", systemImage: "bubble.left")
          }
          .accessibilityIdentifier("askCartaAgent")
        }
      }
    }
    .task { await model.load(app) }
  }

  @ViewBuilder
  private func summary(_ s: CapSnapshot, _ result: CapTableResult) -> some View {
    Section {
      if let fd = s.fullyDilutedShares { LabeledContent("Fully diluted") { Text(fd.formatted()) } }
      if let pool = s.optionPoolAvailable { LabeledContent("Option pool available") { Text(pool.formatted()) } }
      if let a = s.latest409a {
        LabeledContent("409A") {
          Text(model.hideAmounts ? "•••" : capUSD(a.pricePerShareUsd, fractionDigits: 2))
        }
      }
      LabeledContent("As of") { Text(LegalDay.display(s.asOf)) }
      if result.syncing { HStack { ProgressView(); Text("Syncing with Carta").padding(.leading, 8) } }
    } header: {
      Text(s.companyName)
    } footer: {
      if result.lastReadFailed { Text("Couldn’t refresh from Carta. Showing the last sync.") }
    }
  }
}

private struct HolderRow: View {
  let holder: CapHolder
  let hide: Bool

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(holder.name)
        Text([holder.security, holder.shares.map { "\($0.formatted()) shares" }]
          .compactMap { $0 }.joined(separator: " · "))
          .font(.footnote).foregroundStyle(Color.token(.mutedForeground))
        if let amount = holder.amountUsd {
          Text("Invested \(hide ? "•••" : capUSD(amount))")
            .font(.footnote).foregroundStyle(Color.token(.mutedForeground))
        }
      }
      Spacer()
      if let percent = holder.percent { Text(capPercent(percent)).monospacedDigit() }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct HolderDetailView: View {
  let holder: CapHolder
  let hide: Bool

  var body: some View {
    List {
      Section {
        if let s = holder.security { LabeledContent("Security") { Text(s) } }
        if let shares = holder.shares { LabeledContent("Shares") { Text(shares.formatted()) } }
        if let p = holder.percent { LabeledContent("Ownership") { Text(capPercent(p)) } }
        if let a = holder.amountUsd { LabeledContent("Invested") { Text(hide ? "•••" : capUSD(a)) } }
      }
      if holder.email != nil || holder.organization != nil {
        Section("Contact") {
          if let o = holder.organization { LabeledContent("Organization") { Text(o) } }
          if let e = holder.email { LabeledContent("Email") { Text(e) } }
        }
      }
    }
    .navigationTitle(holder.name)
    .navigationBarTitleDisplayMode(.inline)
  }
}
