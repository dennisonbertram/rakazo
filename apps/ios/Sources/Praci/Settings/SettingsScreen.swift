import RakazoAPI
import RakazoUI
import SwiftUI

struct SettingsScreen: View {
  @Environment(AppModel.self) private var app
  @AppStorage(AppearanceChoice.storageKey) private var appearance = AppearanceChoice.system
  @State private var model = SettingsModel()

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.load(app) } }, content: { profile in
      list(profile)
    })
    .navigationTitle("Settings")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button { app.showingSettings = false } label: { Label("Done", systemImage: "xmark") }
          .accessibilityIdentifier("closeSettings")
      }
    }
    .task { await model.load(app) }
    .onAppear { appearance.apply() }
  }

  private func list(_ profile: Me) -> some View {
    List {
      topSections(profile)
      preferenceSection
      Section {
        NavigationLink { ArchivedScreen() } label: {
          Label("Archived agents", systemImage: "archivebox")
        }
        .accessibilityIdentifier("archived")
      }
      Section {
        Button("Sign out", role: .destructive) {
          Task { await app.authentication.signOut() }
        }
        .accessibilityIdentifier("signOut")
      }
    }
  }

  @ViewBuilder
  private func topSections(_ profile: Me) -> some View {
    Section {
      NavigationLink {
        AccountScreen(profile: profile)
      } label: {
        HStack(spacing: 12) {
          Initials(name: profile.name)
          VStack(alignment: .leading) {
            Text(profile.name)
            Text("Account").font(.caption).foregroundStyle(Color.token(.mutedForeground))
          }
        }
      }
      .accessibilityIdentifier("account")
    }
    Section {
      NavigationLink { ModelsScreen() } label: { Label("Models", systemImage: "cpu") }
      NavigationLink { VoiceSettingsScreen() } label: { Label("Voice", systemImage: "waveform") }
      NavigationLink { IntegrationsScreen() } label: {
        Label("Integrations", systemImage: "square.grid.2x2")
      }
    }
    Section {
      NavigationLink { AIDataSharingScreen() } label: {
        Label("AI data sharing", systemImage: "hand.raised")
      }
      NavigationLink { ApprovalRulesScreen() } label: {
        Label("Allowed without asking", systemImage: "checkmark.shield")
      }
    }
  }

  @ViewBuilder
  private var preferenceSection: some View {
    Section {
      Toggle(
        isOn: Binding(
          get: { model.hideAmounts },
          set: { value in Task { await model.setHideAmounts(value, app) } })
      ) {
        Label("Hide amounts", systemImage: "eye.slash")
      }
      .accessibilityIdentifier("hideAmounts")
      Picker(selection: $appearance) {
        ForEach(AppearanceChoice.allCases) { Text($0.title).tag($0) }
      } label: {
        Label("Appearance", systemImage: "circle.lefthalf.filled")
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("appearance")
      .onChange(of: appearance) { _, new in new.apply() }
      NavigationLink { NotificationPreferencesScreen() } label: {
        Label("Notifications", systemImage: "bell")
      }
      .accessibilityIdentifier("notifications")
      NavigationLink { UsageScreen() } label: { Label("Usage", systemImage: "chart.bar") }
        .accessibilityIdentifier("usage")
    } footer: {
      if let message = model.errorMessage {
        Text(message).foregroundStyle(Color.token(.destructive))
      }
    }
  }
}
