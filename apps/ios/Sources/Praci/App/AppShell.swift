import SwiftUI

struct AppShell: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    // ponytail: NavigationStack until the Duo phase moves this to NavigationSplitView.
    NavigationStack(path: $app.path) {
      HomeScreen()
        .safeAreaInset(edge: .top, spacing: 0) { RecordingBar() }
        .navigationDestination(for: Route.self) { route in
          destination(route).safeAreaInset(edge: .top, spacing: 0) { RecordingBar() }
        }
    }
    .safeAreaInset(edge: .bottom) {
      if let id = app.archivedMessageID { ArchivedToast(messageID: id) }
    }
    .animation(.default, value: app.archivedMessageID)
    .alert(
      app.capture.closedAlert ?? "", isPresented: Binding(
        get: { app.capture.closedAlert != nil }, set: { if !$0 { app.capture.closedAlert = nil } })
    ) {
      Button("OK", role: .cancel) {}
    }
    .sheet(isPresented: $app.showingSettings, onDismiss: app.settingsDidClose) {
      SettingsSheet(destination: app.settingsDestination)
    }
  }

  @ViewBuilder
  private func destination(_ route: Route) -> some View {
    switch route {
    case .thread(let target): ThreadScreen(target: target)
    case .inbox: InboxScreen()
    case .inboxMessage(let id): InboxMessageScreen(messageID: id)
    case .computer(let id): ComputerScreen(botID: id)
    case .artifacts(let id): ArtifactsScreen(botID: id)
    case .artifact(let id): ArtifactScreen(artifactID: id)
    case .agentPage(let id): AgentPageScreen(botID: id)
    case .routines(let id): RoutinesScreen(botID: id)
    case .routine(let id): RoutineScreen(routineID: id)
    case .botSettings(let id): BotSettingsScreen(botID: id)
    case .groupSettings(let id): GroupSettingsScreen(groupID: id)
    case .finance: FinanceScreen()
    case .legal: LegalScreen()
    case .capTable: CapTableScreen()
    case .dataRoom: DataRoomScreen()
    case .meetings: MeetingsScreen()
    case .meeting(let id): MeetingDetailScreen(meetingID: id)
    }
  }
}

/// "Archived" with Undo, for a message archived without an Inbox list behind it.
private struct ArchivedToast: View {
  let messageID: String
  @Environment(AppModel.self) private var app

  var body: some View {
    HStack(spacing: 16) {
      Text("Archived")
      Button("Undo") {
        app.archivedMessageID = nil
        Task { try? await InboxMessageClient.live(app).unarchive(messageID) }
      }
      .fontWeight(.semibold)
      .accessibilityIdentifier("shellUndo")
    }
    .font(.subheadline)
    .padding(.horizontal, 20).padding(.vertical, 12)
    .glassEffect()
    .padding(.bottom, 8)
    .task(id: messageID) {
      try? await Task.sleep(for: .seconds(4))
      if app.archivedMessageID == messageID { app.archivedMessageID = nil }
    }
  }
}
