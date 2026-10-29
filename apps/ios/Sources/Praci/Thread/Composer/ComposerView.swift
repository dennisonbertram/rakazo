import PhotosUI
import RakazoAPI
import RakazoCore
import SwiftUI
import UniformTypeIdentifiers

struct ComposerView: View {
  let model: ThreadModel
  @Environment(AppModel.self) private var app
  @State private var picking = false
  @State private var importing = false
  @State private var photos: [PhotosPickerItem] = []
  @FocusState private var focused: Bool
  @State private var dictation = DictationModel()

  private var composer: ComposerModel { model.composer }

  var body: some View {
    @Bindable var composer = composer
    VStack(alignment: .leading, spacing: 8) {
      if SendQueue.shared.offline {
        Text("Offline. Messages send when you reconnect.")
          .font(.footnote).foregroundStyle(Color.token(.mutedForeground))
          .accessibilityIdentifier("offlineBanner")
      }
      if let reply = composer.reply { replyStrip(reply) }
      if !composer.attachments.isEmpty { chips }
      if let notice = composer.notice {
        Text(notice).font(.footnote).foregroundStyle(Color.token(.destructive))
          .accessibilityIdentifier("composerNotice")
      }
      DictationNotice(model: dictation)
      HStack(alignment: .bottom, spacing: 8) {
        attachMenu
        TextField("Message \(model.title)", text: $composer.text, axis: .vertical)
          .lineLimit(1...5)
          .focused($focused)
          .submitLabel(.send)
          .onSubmit { if composer.canSend { composer.send(app) } }
          .padding(.horizontal, 16).padding(.vertical, 10)
          .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22))
          .accessibilityIdentifier("messageField")
        trailing
      }
    }
    .padding(.horizontal, 16).padding(.vertical, 8)
    .task { SendQueue.shared.bind(app) }
    .photosPicker(
      isPresented: $picking, selection: $photos, maxSelectionCount: max(composer.slotsLeft, 1),
      matching: .images
    )
    .onChange(of: photos) { _, items in
      guard !items.isEmpty else { return }
      photos = []
      Task { await load(items) }
    }
    .fileImporter(
      isPresented: $importing, allowedContentTypes: [.item], allowsMultipleSelection: true
    ) { result in
      guard case .success(let urls) = result else { return }
      for url in urls.prefix(composer.slotsLeft) { importFile(url) }
    }
  }

  // MARK: Pieces

  private var attachMenu: some View {
    Menu {
      Button { picking = true } label: { Label("Photo Library", systemImage: "photo") }
      Button { importing = true } label: { Label("Files", systemImage: "doc") }
    } label: {
      Image(systemName: "plus").font(.body.weight(.semibold)).frame(width: 44, height: 44)
    }
    .buttonStyle(.glass)
    .buttonBorderShape(.circle)
    .disabled(composer.slotsLeft == 0)
    .accessibilityLabel("Attach")
    .accessibilityIdentifier("attach")
  }

  @ViewBuilder private var trailing: some View {
    if !model.runningRuns.isEmpty {
      Button { Task { await composer.stop(app) } } label: {
        if composer.stopping {
          ProgressView().frame(width: 44, height: 44)
        } else {
          Image(systemName: "stop.fill").frame(width: 44, height: 44)
        }
      }
      .buttonStyle(.glassProminent)
      .buttonBorderShape(.circle)
      .disabled(composer.stopping)
      .accessibilityLabel("Stop")
      .accessibilityIdentifier("stop")
    } else if dictation.listening || (composer.text.isEmpty && composer.attachments.isEmpty) {
      DictationButton(model: dictation, text: Bindable(composer).text)
    } else {
      Button { composer.send(app) } label: {
        Image(systemName: "arrow.up").frame(width: 44, height: 44)
      }
      .buttonStyle(.glassProminent)
      .buttonBorderShape(.circle)
      .disabled(!composer.canSend)
      .accessibilityLabel("Send")
      .accessibilityIdentifier("send")
    }
  }

  private func replyStrip(_ reply: ReplyTarget) -> some View {
    HStack(spacing: 8) {
      Rectangle().fill(Color.token(.mutedForeground)).frame(width: 2)
      VStack(alignment: .leading, spacing: 2) {
        Text("Replying to \(reply.author)").font(.caption.weight(.semibold))
        Text(reply.quote).font(.footnote).lineLimit(1)
          .foregroundStyle(Color.token(.mutedForeground))
      }
      Spacer(minLength: 0)
      Button { composer.reply = nil } label: {
        Image(systemName: "xmark").frame(width: 44, height: 44)
      }
      .accessibilityLabel("Cancel reply")
    }
    .fixedSize(horizontal: false, vertical: true)
    .padding(.horizontal, 12)
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 20))
    .accessibilityIdentifier("replyStrip")
  }

  private var chips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(composer.attachments, id: \.id) { file in
          HStack(spacing: 6) {
            Image(systemName: file.mimeType.hasPrefix("image/") ? "photo" : "doc")
            Text(file.name).font(.footnote).lineLimit(1).frame(maxWidth: 140)
            Button {
              composer.attachments.removeAll { $0.id == file.id }
            } label: {
              Image(systemName: "xmark.circle.fill")
                .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Remove \(file.name)")
          }
          .padding(.leading, 12)
          .background(Color.token(.muted), in: Capsule())
        }
      }
    }
    .accessibilityIdentifier("attachmentChips")
  }

  // MARK: Loading picked files

  private func load(_ items: [PhotosPickerItem]) async {
    for item in items.prefix(composer.slotsLeft) {
      guard let data = try? await item.loadTransferable(type: Data.self) else {
        composer.notice = "That photo couldn’t be loaded."
        continue
      }
      let type = item.supportedContentTypes.first { $0.conforms(to: .image) }
      let ext = type?.preferredFilenameExtension ?? "jpg"
      composer.add(data: data, name: "Photo.\(ext)", type: type)
    }
  }

  private func importFile(_ url: URL) {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard let data = try? Data(contentsOf: url) else {
      composer.notice = "\(url.lastPathComponent) couldn’t be read."
      return
    }
    composer.add(
      data: data, name: url.lastPathComponent, type: UTType(filenameExtension: url.pathExtension))
  }
}
