import Observation
import RakazoAPI

@MainActor
@Observable
final class CapTableModel {
  var state: Loadable<CapTableResult> = .idle
  var hideAmounts = false
  var agentID: String?

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      state = .loaded(try await app.call("investors/capTable"))
    } catch {
      if state.value == nil { state = .failed(settingsErrorText(error)) }
    }
    if let profile: Me = try? await app.call("me") { hideAmounts = profile.hideAmounts }
    if agentID == nil, let agent: CartaAgent = try? await app.call("carta/agent") { agentID = agent.id }
  }
}

/// `rpc_carta_agent`: only the id is needed to open its thread.
struct CartaAgent: Decodable, Sendable { let id: String }
