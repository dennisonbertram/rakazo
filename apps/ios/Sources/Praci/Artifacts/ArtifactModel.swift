import Foundation
import Observation
import RakazoAPI

@MainActor
@Observable
final class ArtifactModel {
  let artifactID: String
  private(set) var state: Loadable<ArtifactDetail> = .idle
  /// Newest first; empty until the list arrives, and a failed read just hides the version picker.
  private(set) var versions: [ArtifactVersion] = []
  private(set) var shareURL: URL?
  private(set) var actionError: String?
  private(set) var removed = false
  private var selectedID: String

  init(artifactID: String) {
    self.artifactID = artifactID
    selectedID = artifactID
  }

  var selectedVersion: Int? { state.value?.summary.version }
  var latestVersion: Int? { versions.first?.version }

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      let detail: ArtifactDetail = try await app.call(
        "artifacts/getById", input: ArtifactIDInput(artifactId: selectedID), timeout: 20)
      state = .loaded(detail)
      shareURL = Self.writeShareFile(detail)
    } catch {
      state = .failed(error.localizedDescription)
    }
    if versions.isEmpty,
      let list: [ArtifactVersion] = try? await app.call(
        "artifacts/listVersions", input: ArtifactFamilyInput(familyId: artifactID))
    {
      versions = list
    }
  }

  func select(_ version: ArtifactVersion, app: AppModel) async {
    selectedID = version.id
    await load(app)
  }

  func remove(app: AppModel) async {
    actionError = nil
    do {
      let _: OKResult = try await app.call(
        "artifacts/remove", input: ArtifactIDInput(artifactId: artifactID))
      removed = true
    } catch {
      actionError = error.localizedDescription
    }
  }

  func dismissError() { actionError = nil }

  /// The share sheet needs a file with the artifact's own name.
  private static func writeShareFile(_ detail: ArtifactDetail) -> URL? {
    guard let data = detail.data else { return nil }
    let folder = FileManager.default.temporaryDirectory.appending(
      path: UUID().uuidString, directoryHint: .isDirectory)
    let name = detail.summary.name.replacing("/", with: "-")
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let url = folder.appending(path: name)
      try data.write(to: url)
      return url
    } catch {
      return nil
    }
  }
}
