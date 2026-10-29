import Foundation
import Observation
import RakazoAPI

@MainActor
@Observable
final class InboxMessageModel {
  /// What the Unsubscribe menu item last did.
  enum UnsubscribeOutcome: Equatable {
    case done, sent, unknown, unavailable
    case opened(URL)
    case confirmMail(String)
    case failed(String)
  }

  let messageID: String
  private(set) var state: Loadable<MailMessage> = .idle
  private(set) var archived = false
  private(set) var isAsking = false
  var actionError: String?
  var unsubscribe: UnsubscribeOutcome?
  var previewURL: URL?
  var notice: String?

  @ObservationIgnored private let client: InboxMessageClient

  init(messageID: String, client: InboxMessageClient) {
    self.messageID = messageID
    self.client = client
  }

  var message: MailMessage? { state.value }

  /// "Name <a@x.test>" parsed; nil when the sender has no usable address.
  var sender: MailAddress? { message.flatMap { MailAddresses.parse($0.from) } }

  func load() async {
    if case .loaded = state { return }
    await reload()
  }

  func reload() async {
    state = .loading
    do {
      state = .loaded(try await client.get(messageID))
    } catch {
      state = .failed(text(error))
    }
  }

  func archive() async {
    do {
      try await client.archive(messageID)
      archived = true
    } catch {
      actionError = text(error)
    }
  }

  func undoArchive() async {
    do {
      try await client.unarchive(messageID)
      archived = false
    } catch {
      actionError = text(error)
    }
  }

  /// The Inbox agent bot to open, with this message as context. One tap, one call.
  func askAgent() async -> String? {
    guard !isAsking else { return nil }
    isAsking = true
    defer { isAsking = false }
    do {
      return try await client.askAgent(messageID).id
    } catch {
      actionError = text(error)
      return nil
    }
  }

  func unsubscribeFromSender(confirmMailto: Bool = false) async {
    guard let sender else {
      unsubscribe = .unavailable
      return
    }
    do {
      let connectionID = try await client.connection(messageID)
      let result = try await client.unsubscribe(connectionID, sender.address, confirmMailto)
      switch result.status {
      case "done": unsubscribe = .done
      case "sent": unsubscribe = .sent
      case "unknown": unsubscribe = .unknown
      case "opened":
        unsubscribe = result.openUrl.flatMap(URL.init(string:)).flatMap { SafeHTML.openableURL($0) }
          .map(UnsubscribeOutcome.opened) ?? .unavailable
      case "needs_confirmation": unsubscribe = .confirmMail(result.mailTo ?? sender.address)
      case "disabled": unsubscribe = .failed("Changing mail is turned off.")
      case "refused": unsubscribe = .failed("The sender didn’t accept that.")
      case "failed": unsubscribe = .failed("Couldn’t unsubscribe.")
      default: unsubscribe = .unavailable
      }
    } catch {
      unsubscribe = .failed(text(error))
    }
  }

  func openAttachment(_ attachment: MailAttachment) async {
    do {
      previewURL = try await client.attachment(messageID, attachment)
    } catch {
      actionError = text(error)
    }
  }

  private func text(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? "Something went wrong. Try again."
  }
}
