import RakazoAPI
import RakazoCore
import RakazoUI
import SwiftUI

struct AccountScreen: View {
  let me: Me
  @Environment(AppModel.self) private var app
  @State private var model = AccountModel()
  @State private var showingDelete = false

  var body: some View {
    List {
      if let notice = model.notice {
        Section { Text(notice).accessibilityIdentifier("accountNotice") }
      }
      Section {
        HStack(spacing: 12) {
          Initials(name: me.name)
          Text(me.name)
        }
        LabeledContent("Email", value: me.email)
      }
      if let security = model.security.value, security.hasPassword, security.passwordChangeEnabled {
        Section {
          NavigationLink {
            ChangePasswordScreen(model: model)
          } label: {
            Text("Change password")
          }
          .accessibilityIdentifier("changePassword")
        }
      }
      Section {
        Button("Sign out") { Task { await app.authentication.signOut() } }
          .accessibilityIdentifier("accountSignOut")
      }
      Section {
        Button("Delete account", role: .destructive) { showingDelete = true }
          .accessibilityIdentifier("deleteAccount")
      }
    }
    .navigationTitle("Account")
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.load(app) }
    .sheet(isPresented: $showingDelete) {
      DeleteAccountSheet(model: model, security: model.security.value, email: me.email)
    }
  }
}

struct Initials: View {
  let name: String

  var body: some View {
    Text(initials)
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(Color.token(.secondaryForeground))
      .frame(width: 40, height: 40)
      .background(Color.token(.secondary), in: Circle())
      .accessibilityHidden(true)
  }

  private var initials: String {
    let letters = name.split(separator: " ").prefix(2).compactMap(\.first)
    return letters.isEmpty ? "?" : String(letters).uppercased()
  }
}
