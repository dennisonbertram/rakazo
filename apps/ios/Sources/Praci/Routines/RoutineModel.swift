import Foundation
import Observation
import RakazoAPI

@MainActor
@Observable
final class RoutineModel {
  let routineID: String
  private(set) var state: Loadable<Routine> = .idle
  private(set) var runs: [RoutineRun] = []
  private(set) var nextCursor: RoutineCursor?
  private(set) var historyError: String?
  private(set) var actionError: String?
  private(set) var updating = false

  init(routineID: String) { self.routineID = routineID }

  /// The deep link carries only the routine id, so the routine is looked for in each agent's list.
  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      let bots: [BotSummary] = try await app.call("bots/list")
      for bot in bots {
        let list: [Routine] = try await app.call(
          "routines/list", input: RoutinesListInput(botId: bot.id))
        if let routine = list.first(where: { $0.id == routineID }) {
          state = .loaded(routine)
          await loadHistory(app, more: false)
          return
        }
      }
      state = .failed(String(localized: "This routine no longer exists."))
    } catch {
      if state.value == nil { state = .failed(error.localizedDescription) }
    }
  }

  func loadHistory(_ app: AppModel, more: Bool) async {
    historyError = nil
    do {
      let history: RoutineHistory = try await app.call(
        "routines/history",
        input: RoutineHistoryInput(routineId: routineID, before: more ? nextCursor : nil))
      runs = more ? runs + history.runs : history.runs
      nextCursor = history.nextCursor
    } catch {
      historyError = error.localizedDescription
    }
  }

  func setActive(_ active: Bool, app: AppModel) async {
    actionError = nil
    updating = true
    defer { updating = false }
    do {
      let updated: Routine = try await app.call(
        "routines/update", input: RoutineActiveInput(routineId: routineID, active: active))
      state = .loaded(updated)
    } catch {
      actionError = error.localizedDescription
    }
  }

  func dismissError() { actionError = nil }
}
