import Foundation
import Observation
import RakazoAPI

@MainActor
@Observable
final class RoutinesModel {
  let botID: String
  private(set) var state: Loadable<[Routine]> = .idle
  private(set) var actionError: String?

  init(botID: String) { self.botID = botID }

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      let list: [Routine] = try await app.call(
        "routines/list", input: RoutinesListInput(botId: botID))
      state = .loaded(list)
    } catch {
      if state.value == nil { state = .failed(error.localizedDescription) }
    }
  }

  func setActive(_ routine: Routine, _ active: Bool, app: AppModel) async {
    actionError = nil
    do {
      let updated: Routine = try await app.call(
        "routines/update", input: RoutineActiveInput(routineId: routine.id, active: active))
      if case .loaded(var list) = state, let index = list.firstIndex(where: { $0.id == updated.id }) {
        list[index] = updated
        state = .loaded(list)
      }
    } catch {
      actionError = error.localizedDescription
    }
  }

  func dismissError() { actionError = nil }
}

extension Routine {
  /// "Weekdays at 8:00 AM", the schedule in the routine's own wording.
  var scheduleText: String { CronText.describe(crons) }

  /// The reason line for a paused routine, nil while it is running.
  var pausedText: String? {
    guard !active else { return nil }
    switch pausedReason {
    case .errors?: return String(localized: "Paused after repeated errors")
    case .noisy?: return String(localized: "Paused because it was too noisy")
    case .budget?: return String(localized: "Paused because the budget ran out")
    case .access?: return String(localized: "Paused because access was lost")
    default: return String(localized: "Paused")
    }
  }
}
