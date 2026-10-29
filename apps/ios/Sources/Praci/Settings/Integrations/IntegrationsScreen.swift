import RakazoAPI
import SwiftUI

struct IntegrationsScreen: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL
  @State private var model = IntegrationsModel()
  @State private var showAll = false

  private static let preview = 6

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.load(app) } }) { snapshot in
      List {
        if let pending = model.pending {
          Section {
            HStack {
              ProgressView()
              Text("Connecting \(pending.name)").foregroundStyle(Color.token(.mutedForeground))
            }
            Button("Cancel", role: .cancel) { Task { await model.cancelPending(app) } }
              .accessibilityIdentifier("cancelConnect")
          }
        }
        if let error = model.error {
          Section { Text(error).foregroundStyle(Color.token(.destructive)) }
        }
        if !snapshot.connections.isEmpty {
          Section("Connected") {
            ForEach(snapshot.connections) { connection in
              NavigationLink {
                ConnectionDetailScreen(connection: connection, model: model)
              } label: {
                VStack(alignment: .leading) {
                  Text(connection.displayName)
                  Text(connection.needsReconnect ? "Needs reconnecting" : Self.appName(connection, snapshot))
                    .font(.caption)
                    .foregroundStyle(Color.token(connection.needsReconnect ? .destructive : .mutedForeground))
                }
              }
              .accessibilityIdentifier("connection-\(connection.id)")
            }
          }
        }
        available(snapshot)
      }
    }
    .navigationTitle("Integrations")
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.load(app) }
    .refreshable { await model.load(app) }
    .onDisappear { Task { await model.cancelPending(app) } }
  }

  private static func appName(_ connection: Connection, _ snapshot: IntegrationsSnapshot) -> String {
    snapshot.catalog.first { $0.slug == connection.provider }?.name ?? connection.provider.capitalized
  }

  private func available(_ snapshot: IntegrationsSnapshot) -> some View {
    let entries = snapshot.catalog.filter { !$0.connected }
    let shown = showAll ? entries : Array(entries.prefix(Self.preview))
    return Section("Available") {
      ForEach(shown) { entry in
        HStack {
          VStack(alignment: .leading) {
            Text(entry.name)
            if let description = entry.description {
              Text(description).font(.caption).foregroundStyle(Color.token(.mutedForeground))
            }
          }
          Spacer()
          Button("Add") { Task { await add(entry) } }
            .buttonStyle(.bordered)
            .disabled(model.pending != nil)
            .accessibilityIdentifier("add-\(entry.slug)")
        }
      }
      if !showAll, entries.count > Self.preview {
        Button("Show more") { showAll = true }.accessibilityIdentifier("showMore")
      }
    }
  }

  private func add(_ entry: ConnectorEntry) async {
    if let url = await model.add(
      app, connectorID: entry.connectorId, provider: entry.slug, name: entry.name)
    {
      openURL(url)
    }
  }
}

private struct ConnectionDetailScreen: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL
  @Environment(\.dismiss) private var dismiss
  let connection: Connection
  let model: IntegrationsModel
  @State private var confirmWrites = false
  @State private var confirmRemove = false

  private var current: Connection {
    model.state.value?.connections.first { $0.id == connection.id } ?? connection
  }

  var body: some View {
    Form {
      Section {
        LabeledContent("Account", value: current.displayName)
        LabeledContent("Access", value: current.writesEnabled ? "Read and write" : "Read only")
      }
      Section {
        Toggle(
          "Allow writes",
          isOn: Binding(
            get: { current.writesEnabled },
            set: { on in
              if on { confirmWrites = true } else { Task { await model.setWrites(app, current, enabled: false) } }
            })
        )
        .accessibilityIdentifier("allowWrites")
      } footer: {
        Text(
          current.writesEnabled
            ? "Bots can ask to send or change things. You approve each one."
            : "Off: bots can read but not send or change anything.")
      }
      if current.needsReconnect {
        Section {
          Button("Reconnect") {
            Task {
              if let url = await model.add(
                app, connectorID: current.connectorId, provider: current.provider,
                name: current.displayName, replacing: current.id)
              {
                openURL(url)
              }
              dismiss()
            }
          }
        }
      }
      Section {
        Button("Remove", role: .destructive) { confirmRemove = true }
          .accessibilityIdentifier("removeConnection")
      } footer: {
        if let error = model.error { Text(error).foregroundStyle(Color.token(.destructive)) }
      }
    }
    .navigationTitle(current.displayName)
    .navigationBarTitleDisplayMode(.inline)
    .alert("Allow writes to \(current.displayName)?", isPresented: $confirmWrites) {
      Button("Cancel", role: .cancel) {}
      Button("Allow") { Task { await model.setWrites(app, current, enabled: true) } }
    } message: {
      Text("Bots will be able to ask to send or change things. You still approve each one.")
    }
    .confirmationDialog("Remove \(current.displayName)?", isPresented: $confirmRemove) {
      Button("Remove", role: .destructive) {
        Task { if await model.remove(app, current) { dismiss() } }
      }
    } message: {
      Text("Bots lose access to this account. You can add it again later.")
    }
  }
}
