import Foundation
import Observation
import RakazoAPI

@MainActor
@Observable
final class ArtifactsModel {
  let botID: String
  private(set) var state: Loadable<[ArtifactSummary]> = .idle
  private(set) var actionError: String?
  var search = ""

  init(botID: String) { self.botID = botID }

  var visible: [ArtifactSummary] {
    guard let items = state.value else { return [] }
    let query = search.trimmingCharacters(in: .whitespaces)
    guard !query.isEmpty else { return items }
    return items.filter { $0.name.localizedStandardContains(query) }
  }

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      var items: [ArtifactSummary] = []
      var cursor: String?
      // ponytail: reads every page up to 10 (600 artifacts); lazy paging if an agent makes more.
      for _ in 0..<10 {
        let page: ArtifactPage = try await app.call(
          "artifacts/listSpace", input: ArtifactsListInput(botId: botID, cursor: cursor))
        items += page.items
        guard let next = page.nextCursor else { break }
        cursor = next
      }
      state = .loaded(items)
    } catch {
      if state.value == nil { state = .failed(error.localizedDescription) }
    }
  }

  func remove(_ artifact: ArtifactSummary, app: AppModel) async {
    actionError = nil
    do {
      let _: OKResult = try await app.call(
        "artifacts/remove", input: ArtifactIDInput(artifactId: artifact.id))
      if case .loaded(let items) = state { state = .loaded(items.filter { $0.id != artifact.id }) }
    } catch {
      actionError = error.localizedDescription
    }
  }

  func dismissError() { actionError = nil }
}
