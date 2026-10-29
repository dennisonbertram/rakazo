import QuickLook
import RakazoAPI
import RakazoUI
import SwiftUI

struct InboxMessageScreen: View {
  let messageID: String
  @Environment(AppModel.self) private var app

  var body: some View { MessageContent(app: app, messageID: messageID) }
}

private struct ComposeRequest: Identifiable {
  enum Kind { case reply, replyAll, forward }
  let kind: Kind
  var id: Kind { kind }
}

private struct MessageContent: View {
  let app: AppModel
  let messageID: String
  @State private var model: InboxMessageModel
  @State private var compose: ComposeRequest?
  @State private var confirmingUnsubscribe = false
  @State private var sentNotice = false
  @Environment(\.dismiss) private var dismiss

  init(app: AppModel, messageID: String) {
    self.app = app
    self.messageID = messageID
    _model = State(initialValue: InboxMessageModel(messageID: messageID, client: .live(app)))
  }

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.reload() } }, content: { message in
      MessageBody(message: message, model: model, server: app.authentication.endpoint)
    })
    .background(Color.token(.background))
    .navigationTitle("Message")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { toolbar }
    .safeAreaInset(edge: .bottom) { bottomBar }
    .sheet(item: $compose) { request in
      ComposeSheet(
        replyTo: request.kind == .forward ? nil : messageID,
        forward: request.kind == .forward ? messageID : nil,
        replyAll: request.kind == .replyAll,
        onSent: { sentNotice = true })
    }
    .quickLookPreview($model.previewURL)
    .confirmationDialog(
      unsubscribeTitle, isPresented: $confirmingUnsubscribe, titleVisibility: .visible
    ) {
      Button("Unsubscribe", role: .destructive) { Task { await model.unsubscribeFromSender() } }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("This can’t be undone.")
    }
    .alert(
      unsubscribeAlertTitle, isPresented: unsubscribeAlertShown, presenting: model.unsubscribe
    ) { outcome in
      unsubscribeActions(outcome)
    } message: { outcome in
      unsubscribeMessage(outcome)
    }
    .alert(
      "Couldn’t finish that",
      isPresented: Binding(get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(verbatim: model.actionError ?? "")
    }
    .task { await model.load() }
    .task(id: sentNotice) {
      guard sentNotice else { return }
      try? await Task.sleep(for: .seconds(3))
      sentNotice = false
    }
  }

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    if let message = model.message {
      ToolbarItemGroup {
        Button { Task { await archive() } } label: { Label("Archive", systemImage: "archivebox") }
          .accessibilityIdentifier("messageArchive")
        Menu {
          Button { compose = ComposeRequest(kind: .reply) } label: {
            Label("Reply", systemImage: "arrowshape.turn.up.left")
          }
          if message.replyAllDiffers {
            Button { compose = ComposeRequest(kind: .replyAll) } label: {
              Label("Reply all", systemImage: "arrowshape.turn.up.left.2")
            }
          }
          Button { compose = ComposeRequest(kind: .forward) } label: {
            Label("Forward", systemImage: "arrowshape.turn.up.right")
          }
        } label: {
          Label("Reply", systemImage: "arrowshape.turn.up.left")
        }
        .accessibilityIdentifier("messageReply")
        if model.sender != nil, !message.fromSelf {
          Menu {
            Button(role: .destructive) { confirmingUnsubscribe = true } label: {
              Label(unsubscribeTitle, systemImage: "envelope.badge")
            }
          } label: {
            Label("More", systemImage: "ellipsis")
          }
          .accessibilityIdentifier("messageMore")
        }
      }
    }
  }

  @ViewBuilder
  private var bottomBar: some View {
    VStack(spacing: 8) {
      if model.archived {
        HStack(spacing: 16) {
          Text("Archived")
          Button("Undo") { Task { await model.undoArchive() } }.fontWeight(.semibold)
            .accessibilityIdentifier("messageUndo")
        }
        .font(.subheadline)
        .padding(.horizontal, 20).padding(.vertical, 12)
        .glassEffect()
      } else if sentNotice {
        Text("Sent")
          .font(.subheadline)
          .padding(.horizontal, 20).padding(.vertical, 12)
          .glassEffect()
          .accessibilityIdentifier("messageSent")
      }
      if model.message != nil {
        Button { Task { await ask() } } label: {
          HStack {
            if model.isAsking { ProgressView() }
            Label("Ask Inbox agent", systemImage: "bubble.left")
          }
          .foregroundStyle(Color.token(.primaryForeground))
          .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.token(.primary))
        .controlSize(.large)
        .disabled(model.isAsking)
        .padding(.horizontal, 16)
        .accessibilityIdentifier("messageAsk")
      }
    }
    .padding(.bottom, 8)
    .animation(.default, value: model.archived)
  }

  private func archive() async {
    await model.archive()
  }

  private func ask() async {
    if let botID = await model.askAgent() { app.open(.thread(.bot(botID))) }
  }

  private var unsubscribeTitle: LocalizedStringKey {
    "Unsubscribe from \(model.sender?.display ?? "this sender")?"
  }

  private var unsubscribeAlertTitle: LocalizedStringKey {
    switch model.unsubscribe {
    case .done: "Unsubscribed"
    case .sent: "Unsubscribe email sent"
    case .opened: "Finish in your browser"
    case .confirmMail(let address): "Send an unsubscribe email to \(address)?"
    case .unknown: "Couldn’t confirm"
    case .unavailable: "Can’t unsubscribe from this sender"
    case .failed, nil: "Couldn’t unsubscribe"
    }
  }

  private var unsubscribeAlertShown: Binding<Bool> {
    Binding(get: { model.unsubscribe != nil }, set: { if !$0 { model.unsubscribe = nil } })
  }

  @ViewBuilder
  private func unsubscribeActions(_ outcome: InboxMessageModel.UnsubscribeOutcome) -> some View {
    switch outcome {
    case .opened(let url):
      Button("Open link") { UIApplication.shared.open(url) }
      Button("Close", role: .cancel) {}
    case .confirmMail:
      Button("Send") { Task { await model.unsubscribeFromSender(confirmMailto: true) } }
      Button("Cancel", role: .cancel) {}
    default:
      Button("OK", role: .cancel) {}
    }
  }

  @ViewBuilder
  private func unsubscribeMessage(_ outcome: InboxMessageModel.UnsubscribeOutcome) -> some View {
    switch outcome {
    case .unknown: Text("Check your Sent mail before trying again.")
    case .failed(let text): Text(verbatim: text)
    case .unavailable: Text("This sender has no unsubscribe option.")
    default: EmptyView()
    }
  }
}

private struct MessageBody: View {
  let message: MailMessage
  let model: InboxMessageModel
  let server: URL
  @State private var showEarlier = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text(message.subject.isEmpty ? "(No subject)" : message.subject)
          .font(.title2.weight(.semibold))
          .foregroundStyle(Color.token(.foreground))
          .accessibilityAddTraits(.isHeader)
        header
        if !message.thread.isEmpty { earlier }
        bodyContent
        if !message.attachments.isEmpty { attachments }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityIdentifier("messageBody")
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack {
        Text(MailAddresses.parse(message.from)?.display ?? message.from)
          .font(.headline)
          .foregroundStyle(Color.token(.foreground))
        if message.fromSelf {
          Label("Sent", systemImage: "checkmark")
            .font(.caption)
            .foregroundStyle(Color.token(.mutedForeground))
        }
      }
      Text("to \(recipients)\(dateText)")
        .font(.subheadline)
        .foregroundStyle(Color.token(.mutedForeground))
      if !message.cc.isEmpty {
        let ccList = MailAddresses.split(message.cc).map { MailAddresses.parse($0)?.display ?? $0 }
          .joined(separator: ", ")
        Text("Cc \(ccList)")
          .font(.subheadline)
          .foregroundStyle(Color.token(.mutedForeground))
      }
    }
    .textSelection(.enabled)
  }

  private var recipients: String {
    let names = MailAddresses.split(message.to).map { MailAddresses.parse($0)?.display ?? $0 }
    return names.isEmpty ? "me" : names.joined(separator: ", ")
  }

  private var dateText: String {
    guard let date = InboxRow.parseDate(message.date) else { return "" }
    return " · " + date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
  }

  private var earlier: some View {
    DisclosureGroup(isExpanded: $showEarlier) {
      ForEach(message.thread) { entry in
        VStack(alignment: .leading, spacing: 2) {
          Text(entry.fromSelf ? "You" : entry.from).font(.subheadline.weight(.semibold))
          Text(entry.snippet).font(.subheadline).lineLimit(3)
            .foregroundStyle(Color.token(.mutedForeground))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
      }
    } label: {
      Text("\(message.thread.count) earlier")
        .font(.subheadline)
        .foregroundStyle(Color.token(.mutedForeground))
    }
    .accessibilityIdentifier("messageEarlier")
  }

  @ViewBuilder
  private var bodyContent: some View {
    if let html = message.html, !html.isEmpty {
      SafeHTMLView(html: html, server: server)
    } else if let text = message.text, !text.isEmpty {
      Text(text)
        .font(.body)
        .foregroundStyle(Color.token(.foreground))
        .textSelection(.enabled)
    } else {
      Text("No content")
        .foregroundStyle(Color.token(.mutedForeground))
    }
  }

  private var attachments: some View {
    VStack(spacing: 0) {
      ForEach(message.attachments) { attachment in
        Button { Task { await model.openAttachment(attachment) } } label: {
          HStack(spacing: 12) {
            Image(systemName: "paperclip").foregroundStyle(Color.token(.mutedForeground))
            VStack(alignment: .leading, spacing: 2) {
              Text(attachment.filename).font(.subheadline).lineLimit(1)
              Text(Int64(attachment.size), format: .byteCount(style: .file))
                .font(.caption).foregroundStyle(Color.token(.mutedForeground))
            }
            Spacer()
          }
          .padding(12)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("messageAttachment")
        if attachment.id != message.attachments.last?.id { Divider() }
      }
    }
    .background(Color.token(.card), in: .rect(cornerRadius: 12))
  }
}
