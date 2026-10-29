import RakazoAPI
import SwiftUI

struct RoutinesScreen: View {
  let botID: String
  @Environment(AppModel.self) private var app
  @State private var model: RoutinesModel
  @State private var botName: String?

  init(botID: String) {
    self.botID = botID
    _model = State(initialValue: RoutinesModel(botID: botID))
  }

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.load(app) } }) { routines in
      if routines.isEmpty {
        ContentUnavailableView("No routines yet", systemImage: "clock.arrow.circlepath")
      } else {
        List(routines) { routine in
          Button { app.open(.routine(routineID: routine.id)) } label: { row(routine) }
            .buttonStyle(.plain)
            .accessibilityIdentifier("routineRow")
            .swipeActions {
              Button {
                Task { await model.setActive(routine, !routine.active, app: app) }
              } label: {
                if routine.active {
                  Label("Pause", systemImage: "pause.fill")
                } else {
                  Label("Resume", systemImage: "play.fill")
                }
              }
              .tint(Color.token(.primary))
              .accessibilityIdentifier(routine.active ? "pauseRoutine" : "resumeRoutine")
            }
        }
        .listStyle(.plain)
      }
    }
    .background(Color.token(.background))
    .navigationTitle(botName.map { "\($0) routines" } ?? "Routines")
    .navigationBarTitleDisplayMode(.inline)
    .task {
      async let name = agentName(botID, app: app)
      await model.load(app)
      botName = await name
    }
    .refreshable { await model.load(app) }
    .alert(
      "Couldn’t update this routine",
      isPresented: Binding(
        get: { model.actionError != nil }, set: { if !$0 { model.dismissError() } }),
      actions: { Button("OK") { model.dismissError() } },
      message: { Text(model.actionError ?? "") })
  }

  private func row(_ routine: Routine) -> some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(routine.name).font(.body).foregroundStyle(Color.token(.foreground))
        Text(routine.scheduleText).font(.footnote).foregroundStyle(Color.token(.mutedForeground))
        if let paused = routine.pausedText {
          Text(paused).font(.footnote).foregroundStyle(Color.token(.warning))
        }
      }
      Spacer(minLength: 8)
      Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
        .foregroundStyle(Color.token(.mutedForeground)).accessibilityHidden(true)
    }
    .contentShape(Rectangle())
  }
}
