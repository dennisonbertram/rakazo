import Foundation
import Observation
import RakazoAPI

struct IntegrationsSnapshot: Sendable {
  var connections: [Connection]
  var catalog: [ConnectorEntry]
}

struct BeginConnectionInput: Encodable, Sendable {
  var connectorId: String
  var provider: String
  var displayName: String
  var replacesConnectionId: String?
}
struct ConnectionIDInput: Encodable, Sendable { var connectionId: String }
struct SetWritesInput: Encodable, Sendable {
  var connectionId: String
  var enabled: Bool
}
struct CatalogInput: Encodable, Sendable {}

struct PendingConnection: Equatable {
  var id: String
  var name: String
}

@MainActor
@Observable
final class IntegrationsModel {
  var state: Loadable<IntegrationsSnapshot> = .idle
  var pending: PendingConnection?
  var error: String?
  @ObservationIgnored private var polling: Task<Void, Never>?

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      async let connections: [Connection] = app.call("connections/list")
      async let catalog: [ConnectorEntry] = app.call(
        "connections/catalog", input: CatalogInput(), timeout: 20)
      let all = try await connections
      state = .loaded(
        IntegrationsSnapshot(
          connections: all.filter { $0.status != "revoked" && $0.id != pending?.id },
          catalog: try await catalog))
    } catch {
      state = .failed(settingsErrorText(error))
    }
  }

  /// Starts the sign-in and returns the page to open, then polls until the provider finishes.
  func add(
    _ app: AppModel, connectorID: String, provider: String, name: String,
    replacing: String? = nil
  ) async -> URL? {
    error = nil
    do {
      let begin: ConnectionBegin = try await app.call(
        "connections/begin",
        input: BeginConnectionInput(
          connectorId: connectorID, provider: provider, displayName: name,
          replacesConnectionId: replacing))
      pending = PendingConnection(id: begin.connectionId, name: name)
      polling = Task { await poll(app, id: begin.connectionId) }
      return begin.authorizationUrl.flatMap(URL.init(string:))
    } catch {
      self.error = settingsErrorText(error)
      return nil
    }
  }

  func cancelPending(_ app: AppModel) async {
    polling?.cancel()
    guard let current = pending else { return }
    pending = nil
    let _: OKResult? = try? await app.call(
      "connections/revoke", input: ConnectionIDInput(connectionId: current.id))
    await load(app)
  }

  func setWrites(_ app: AppModel, _ connection: Connection, enabled: Bool) async {
    error = nil
    do {
      let _: Connection = try await app.call(
        "connections/setWrites", input: SetWritesInput(connectionId: connection.id, enabled: enabled))
      await load(app)
    } catch {
      self.error = settingsErrorText(error)
    }
  }

  func remove(_ app: AppModel, _ connection: Connection) async -> Bool {
    error = nil
    do {
      let _: OKResult = try await app.call(
        "connections/revoke", input: ConnectionIDInput(connectionId: connection.id))
      await load(app)
      return true
    } catch {
      self.error = settingsErrorText(error)
      return false
    }
  }

  /// Checks every 2 s for up to five minutes.
  private func poll(_ app: AppModel, id: String) async {
    for _ in 0..<150 {
      try? await Task.sleep(for: .seconds(2))
      if Task.isCancelled { return }
      do {
        let result: Connection = try await app.call(
          "connections/complete", input: ConnectionIDInput(connectionId: id))
        if result.isConnected {
          pending = nil
          await load(app)
          return
        }
        if result.status == "error" || result.status == "revoked" {
          error = result.error ?? "Sign-in did not finish."
          pending = nil
          await load(app)
          return
        }
      } catch {
        self.error = settingsErrorText(error)
        pending = nil
        return
      }
    }
    error = "Sign-in did not finish. Try again."
    await cancelPending(app)
  }
}
