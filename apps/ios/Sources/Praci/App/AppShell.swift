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
