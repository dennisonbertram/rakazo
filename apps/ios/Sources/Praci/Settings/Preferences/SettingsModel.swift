import Foundation
import Observation
import RakazoAPI

private struct HideAmountsUpdate: Encodable, Sendable { let hideAmounts: Bool }

/// The profile and the server-side preferences shown in the Settings list.
@MainActor
@Observable
final class SettingsModel {
  var state: Loadable<Me> = .idle
  /// Shown under the list when a change could not be saved.
  var errorMessage: String?
  private(set) var hideAmounts = false

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      let me: Me = try await app.call("me")
      hideAmounts = me.hideAmounts
      state = .loaded(me)
    } catch {
      if state.value == nil { state = .failed(error.localizedDescription) }
    }
  }

  /// Flips the switch at once and puts it back if the server refuses.
  func setHideAmounts(_ value: Bool, _ app: AppModel) async {
    let previous = hideAmounts
    hideAmounts = value
    errorMessage = nil
    do {
      let me: Me = try await app.call("preferences/update", input: HideAmountsUpdate(hideAmounts: value))
      hideAmounts = me.hideAmounts
    } catch {
      hideAmounts = previous
      errorMessage = error.localizedDescription
    }
  }
}
