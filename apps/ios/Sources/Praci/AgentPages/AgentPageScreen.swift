import RakazoAPI
import SwiftUI

/// The agent's own page, read-only. `rpc_pages_get` answers null when the agent has not saved one.
struct AgentPageScreen: View {
  let botID: String
  @Environment(AppModel.self) private var app
  @State private var state: Loadable<AgentPage?> = .idle
  @State private var botName: String?

  var body: some View {
    LoadableView(state: state, retry: { Task { await load() } }, content: { page in
      if let page, !page.content.isEmpty {
        ScrollView {
          VStack(alignment: .leading, spacing: 12) {
            MarkdownView(text: page.content)
            if let updated = detailTimestamp(page.updatedAt) {
              Text("Updated \(updated)").font(.footnote)
                .foregroundStyle(Color.token(.mutedForeground))
            }
          }
          .padding()
        }
      } else {
        ContentUnavailableView("No page yet", systemImage: "doc.text")
      }
    })
    .background(Color.token(.background))
    .navigationTitle(botName ?? "Page")
    .navigationBarTitleDisplayMode(.inline)
    .safeAreaInset(edge: .bottom) {
      Button { app.open(.thread(.bot(botID))) } label: {
        Text("Open chat").frame(maxWidth: .infinity).foregroundStyle(Color.token(.primaryForeground))
      }
      .buttonStyle(.borderedProminent)
      .tint(Color.token(.primary))
      .controlSize(.large)
      .padding()
      .accessibilityIdentifier("openChat")
    }
    .task {
      async let name = agentName(botID, app: app)
      await load()
      botName = await name
    }
    .refreshable { await load() }
  }

  private func load() async {
    if state.value == nil { state = .loading }
    do {
      let page: AgentPage? = try await app.call("pages/get", input: PageGetInput(botId: botID))
      state = .loaded(page)
    } catch {
      if state.value == nil { state = .failed(error.localizedDescription) }
    }
  }
}
