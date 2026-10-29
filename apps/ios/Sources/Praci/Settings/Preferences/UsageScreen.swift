import Observation
import RakazoAPI
import SwiftUI

@MainActor
@Observable
final class UsageModel {
  var state: Loadable<UsageSummary> = .idle

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      state = .loaded(try await app.call("usage/summary"))
    } catch {
      if state.value == nil { state = .failed(error.localizedDescription) }
    }
  }
}

struct UsageScreen: View {
  @Environment(AppModel.self) private var app
  @State private var model = UsageModel()

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.load(app) } }) { usage in
      List {
        row("Runs", usage.runs)
        row("Model calls", usage.modelCalls)
        row("Input tokens", usage.inputTokens)
        row("Output tokens", usage.outputTokens)
        row("Total tokens", usage.totalTokens)
      }
    }
    .navigationTitle("Usage")
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.load(app) }
    .refreshable { await model.load(app) }
  }

  private func row(_ title: LocalizedStringKey, _ value: Int?) -> some View {
    LabeledContent(title) {
      Text(value.map { $0.formatted() } ?? "—")
    }
  }
}
