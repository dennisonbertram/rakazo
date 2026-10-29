import RakazoAPI
import SwiftUI

struct BotSettingsScreen: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let botID: String
  @State private var state: Loadable<BotDetail> = .idle
  @State private var sections: [BotSection] = []
  @State private var name = ""
  @State private var role = ""
  @State private var color = ""
  @State private var speak = false
  @State private var pinned = false
  @State private var sectionID: String?
  @State private var busy = false
  @State private var error: String?
  @State private var confirmDiscard = false

  var body: some View {
    LoadableView(state: state, retry: { Task { await load() } }) { bot in
      form(bot)
    }
    .navigationTitle("Agent settings")
    .navigationBarTitleDisplayMode(.inline)
    .task { await load() }
  }

  private func form(_ bot: BotDetail) -> some View {
    let dirty =
      ManageClient.clean(name) != bot.name || role != bot.title
      || color.caseInsensitiveCompare(bot.color ?? "") != .orderedSame
      || speak != bot.autoSpeak || pinned != bot.pinned || sectionID != bot.sectionId
    return Form {
      Section {
        TextField("Name", text: $name).accessibilityIdentifier("botName")
        TextField("Role", text: $role).accessibilityIdentifier("botRole")
      }
      Section("Color") { ColorSwatches(selection: $color) }
      Section {
        Toggle("Pinned", isOn: $pinned).accessibilityIdentifier("botPinned")
        if !sections.isEmpty {
          Picker("Section", selection: $sectionID) {
            Text("None").tag(String?.none)
            ForEach(sections) { Text($0.name).tag(Optional($0.id)) }
          }
        }
      }
      Section("Voice") {
        Toggle("Read replies aloud", isOn: $speak).accessibilityIdentifier("botSpeak")
      }
      if let error {
        Section {
          Text(error).foregroundStyle(Color.token(.destructive))
          Button("Retry") { Task { await save(bot) } }
        }
      }
      Section {
        if bot.archivedAt == nil {
          Button("Archive", role: .destructive) { Task { await archive(bot) } }
            .accessibilityIdentifier("archiveBot")
        } else {
          Button("Restore") { Task { await restore() } }
            .accessibilityIdentifier("restoreBot")
        }
      }
    }
    .accessibilityIdentifier("botSettings")
    .navigationBarBackButtonHidden(dirty)
    .toolbar {
      if dirty {
        ToolbarItem(placement: .cancellationAction) {
          Button { confirmDiscard = true } label: { Label("Back", systemImage: "chevron.left") }
        }
      }
      ToolbarItem(placement: .confirmationAction) {
        if busy {
          ProgressView()
        } else {
          Button("Save") { Task { await save(bot) } }
            .disabled(!dirty || ManageClient.clean(name).isEmpty)
            .accessibilityIdentifier("save")
        }
      }
    }
    .alert("Discard changes?", isPresented: $confirmDiscard) {
      Button("Keep editing", role: .cancel) {}
      Button("Discard", role: .destructive) { dismiss() }
    } message: {
      Text("Your edits to \(bot.name) are not saved.")
    }
  }

  private func load() async {
    state = .loading
    do {
      let bot = try await ManageClient.bot(botID, app: app)
      name = bot.name
      role = bot.title
      color = bot.color ?? BotPalette.colors[0]
      speak = bot.autoSpeak
      pinned = bot.pinned
      sectionID = bot.sectionId
      state = .loaded(bot)
      sections = (try? await ManageClient.agents(app: app).botSections) ?? []
    } catch {
      state = .failed(error.localizedDescription)
    }
  }

  private func save(_ bot: BotDetail) async {
    busy = true
    error = nil
    defer { busy = false }
    var input = BotUpdateInput(botId: bot.id)
    if ManageClient.clean(name) != bot.name { input.name = ManageClient.clean(name) }
    if role != bot.title { input.title = role.trimmingCharacters(in: .whitespacesAndNewlines) }
    if color.caseInsensitiveCompare(bot.color ?? "") != .orderedSame { input.color = color }
    if speak != bot.autoSpeak { input.autoSpeak = speak }
    if pinned != bot.pinned { input.pinned = pinned }
    if sectionID != bot.sectionId {
      input.sectionId = sectionID
      input.clearSection = sectionID == nil
    }
    do {
      try await ManageClient.update(input, app: app)
      state = .loaded(try await ManageClient.bot(botID, app: app))
      if let fresh = state.value {
        name = fresh.name
        role = fresh.title
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func archive(_ bot: BotDetail) async {
    do {
      try await ManageClient.archive(.bot(bot.id), name: bot.name, app: app, onChange: {})
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func restore() async {
    do {
      try await ManageClient.archived(.bot(botID), false, app: app)
      await load()
    } catch {
      self.error = error.localizedDescription
    }
  }
}
