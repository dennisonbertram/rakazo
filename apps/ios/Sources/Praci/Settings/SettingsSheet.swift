import SwiftUI

/// A Settings screen that other screens can open directly (a Connect button, a Reconnect banner).
enum SettingsDestination: Hashable {
  case integrations, models
}

/// The Settings sheet. With a destination it opens that screen already pushed; Done closes it.
struct SettingsSheet: View {
  @Environment(AppModel.self) private var app
  @State private var path: [SettingsDestination]

  init(destination: SettingsDestination?) {
    _path = State(initialValue: destination.map { [$0] } ?? [])
  }

  var body: some View {
    NavigationStack(path: $path) {
      SettingsScreen()
        .navigationDestination(for: SettingsDestination.self) { destination in
          screen(destination)
            .toolbar {
              ToolbarItem(placement: .topBarTrailing) {
                Button { app.showingSettings = false } label: { Label("Done", systemImage: "xmark") }
                  .accessibilityIdentifier("closeSettings")
              }
            }
        }
    }
  }

  @ViewBuilder
  private func screen(_ destination: SettingsDestination) -> some View {
    switch destination {
    case .integrations: IntegrationsScreen()
    case .models: ModelsScreen()
    }
  }
}
