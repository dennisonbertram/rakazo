import SwiftUI

struct RootView: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    Group {
      if app.authentication.isSignedIn {
        AppShell()
      } else {
        AuthenticationView(model: app.authentication)
      }
    }
    .onChange(of: app.authentication.isSignedIn) { _, signedIn in
      if !signedIn { app.reset() }
    }
    .onChange(of: app.authentication.endpoint) { _, _ in app.reloadSpace() }
    .consentSheet(app.consent)
    .onOpenURL { app.open($0) }
  }
}
