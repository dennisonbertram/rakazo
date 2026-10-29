import SwiftUI

struct HomeScreen: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    Text("Home")
      .toolbar {
        Button { app.showingSettings = true } label: {
          Label("Settings", systemImage: "gearshape")
        }
        .accessibilityIdentifier("settings")
      }
  }
}
