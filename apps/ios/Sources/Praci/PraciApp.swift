import RakazoUI
import SwiftUI

@main
struct PraciApp: App {
  @State private var app = AppModel(authentication: AuthenticationModel())
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(app)
        .tint(Color.token(.primary))
        .task {
          AppearanceChoice.applyStored()
          await app.authentication.start()
        }
        .onChange(of: scenePhase) { _, phase in
          if phase == .active {
            Task { await app.authentication.revalidate() }
          }
        }
    }
  }
}
