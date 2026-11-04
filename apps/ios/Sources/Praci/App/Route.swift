import Foundation

enum ThreadTarget: Hashable, Sendable {
  case bot(String)
  case group(String)
}

enum Route: Hashable, Sendable {
  case thread(ThreadTarget)
  case inbox
  case inboxMessage(messageID: String)
  case computer(botID: String)
  case artifacts(botID: String)
  case artifact(artifactID: String)
  case agentPage(botID: String, pageID: String? = nil)
  case routines(botID: String)
  case routine(routineID: String)
  case botSettings(botID: String)
  case groupSettings(groupID: String)
  case finance
  case legal
  case capTable
  case dataRoom
  case dataRoomItem(itemID: String)
  case meetings
  case meeting(id: String)

  /// A web path an agent wrote as a Markdown link, such as `/app/pages/<bot>/<page>`. Anything the app
  /// has no screen for returns nil, so the link does nothing.
  init?(appPath: String) {
    guard appPath.hasPrefix("/app/"), let url = URLComponents(string: appPath), url.host == nil
    else { return nil }
    let parts = url.path.split(separator: "/", omittingEmptySubsequences: false).dropFirst(2).map(String.init)
    switch parts.first {
    case "pages" where parts.count == 3 && !parts[1].isEmpty && !parts[2].isEmpty:
      self = .agentPage(botID: parts[1], pageID: parts[2])
    case "artifacts" where parts.count == 2 && !parts[1].isEmpty:
      self = .artifact(artifactID: parts[1])
    case "data-room" where parts.count == 1:
      if let id = url.queryItems?.first(where: { $0.name == "item" })?.value, !id.isEmpty {
        self = .dataRoomItem(itemID: id)
      } else {
        self = .dataRoom
      }
    default: return nil
    }
  }

  /// Accepts only `rakazo://open/...`; any other URL (including `rakazo://sign-in`) is ignored.
  init?(url: URL) {
    guard url.scheme == "rakazo", url.host() == "open" else { return nil }
    let parts = Array(url.pathComponents.dropFirst().filter { $0 != "/" })
    guard parts.count <= 3 else { return nil }
    switch (parts.first, parts.dropFirst().first, parts.dropFirst(2).first) {
    case ("inbox", nil, nil): self = .inbox
    case ("finance", nil, nil): self = .finance
    case ("legal", nil, nil): self = .legal
    case ("cap-table", nil, nil): self = .capTable
    case ("data-room", nil, nil): self = .dataRoom
    case ("meetings", nil, nil): self = .meetings
    case ("meeting", let id?, nil): self = .meeting(id: id)
    case ("inbox", let id?, nil): self = .inboxMessage(messageID: id)
    case ("bot", let id?, nil): self = .thread(.bot(id))
    case ("group", let id?, nil): self = .thread(.group(id))
    case ("artifact", let id?, nil): self = .artifact(artifactID: id)
    case ("routine", let id?, nil): self = .routine(routineID: id)
    case ("bot", let id?, "computer"): self = .computer(botID: id)
    case ("bot", let id?, "artifacts"): self = .artifacts(botID: id)
    case ("bot", let id?, "page"): self = .agentPage(botID: id)
    case ("bot", let id?, "routines"): self = .routines(botID: id)
    case ("bot", let id?, "settings"): self = .botSettings(botID: id)
    case ("group", let id?, "settings"): self = .groupSettings(groupID: id)
    default: return nil
    }
  }
}
