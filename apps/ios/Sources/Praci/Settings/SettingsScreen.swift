import SwiftUI

struct SettingsScreen: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    List {
      Text("Settings")
      Button("Sign out", role: .destructive) {
        Task { await app.authentication.signOut() }
      }
      .accessibilityIdentifier("signOut")
    }
  }
}
