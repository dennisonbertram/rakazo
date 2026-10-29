import RakazoAPI
import RakazoUI
import SwiftUI

struct InboxScreen: View {
  @Environment(AppModel.self) private var app

  var body: some View { InboxContent(app: app) }
}

private struct InboxContent: View {
  let app: AppModel
  @State private var model: InboxModel

  init(app: AppModel) {
    self.app = app
    _model = State(initialValue: InboxModel(client: .live(app)))
  }

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.retry() } }, content: { list in
      InboxListView(model: model, list: list, open: open, goToSettings: { app.showingSettings = true })
    })
    .background(Color.token(.background))
    .navigationTitle("Inbox")
    .navigationBarTitleDisplayMode(.large)
    .searchable(text: $model.query, prompt: "Search mail")
    .onSubmit(of: .search) { Task { await model.search() } }
    .toolbar {
      if let list = model.list {
        if list.accounts.count > 1 {
          ToolbarItem {
            Menu {
              Picker("Account", selection: accountSelection) {
                Text("All").tag(String?.none)
                ForEach(list.accounts) { account in Text(account.label).tag(String?.some(account.id)) }
              }
            } label: {
              Label("Account", systemImage: "line.3.horizontal.decrease")
            }
            .accessibilityIdentifier("inboxAccount")
          }
        }
        if let agent = list.agent {
          ToolbarItem {
            Button { app.open(.thread(.bot(agent.botId))) } label: {
              Label("Ask", systemImage: "bubble.left")
            }
            .accessibilityIdentifier("inboxAsk")
          }
        }
      }
    }
    .safeAreaInset(edge: .bottom) {
      if let toast = model.toast { ToastView(toast: toast, model: model) }
    }
    .animation(.default, value: model.toast)
    .alert(
      "Couldn’t finish that",
      isPresented: Binding(get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(verbatim: model.actionError ?? "")
    }
    .task { await model.start() }
  }

  private var accountSelection: Binding<String?> {
    Binding(get: { model.connectionID }, set: { id in Task { await model.select(account: id) } })
  }

  private func open(_ row: InboxRow) {
    model.didOpen(row)
    app.open(.inboxMessage(messageID: row.id))
  }
}

private struct ToastView: View {
  let toast: InboxModel.Toast
  let model: InboxModel

  var body: some View {
    HStack(spacing: 16) {
      switch toast.undo {
      case .unarchive: Text("Archived")
      case .batch: Text("Moved to spam")
      }
      Button("Undo") { Task { await model.undo(toast) } }
        .fontWeight(.semibold)
        .accessibilityIdentifier("inboxUndo")
    }
    .font(.subheadline)
    .padding(.horizontal, 20)
    .padding(.vertical, 12)
    .glassEffect()
    .padding(.bottom, 8)
    .task(id: toast.id) {
      try? await Task.sleep(for: .seconds(5))
      model.dismissToast(toast.id)
    }
  }
}
