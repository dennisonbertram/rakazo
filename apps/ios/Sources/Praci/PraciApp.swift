import RakazoUI
import SwiftUI
import UserNotifications

@main
struct PraciApp: App {
  @State private var app: AppModel
  @State private var router: NotificationRouter
  @Environment(\.scenePhase) private var scenePhase

  init() {
    let app = AppModel(authentication: AuthenticationModel())
    let router = NotificationRouter(app: app)
    _app = State(initialValue: app)
    _router = State(initialValue: router)
    UNUserNotificationCenter.current().delegate = router
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(app)
        .tint(Color.token(.primary))
        .task {
          AppearanceChoice.applyStored()
          await app.authentication.start()
          router.settle(startupDone: true)
        }
        .onChange(of: app.authentication.isSignedIn) { _, _ in router.settle(startupDone: false) }
        .onChange(of: scenePhase) { _, phase in
          if phase == .active {
            Task { await app.authentication.revalidate() }
          }
        }
    }
  }
}
