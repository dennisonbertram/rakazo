import Observation
import RakazoAPI
import SwiftUI

/// What the space and the voice settings allow before a recording can start.
@MainActor
@Observable
final class RecordModel {
  struct Options: Equatable {
    let spaceID: String
    /// "remind", "confirm" or "off".
    let policy: String
    /// A hosted provider is set up, consented to, and transcribes speech.
    let serverTranscribes: Bool
  }

  private(set) var options: Options?

  func load(_ app: AppModel) async {
    async let boot: Bootstrap? = try? await app.call("bootstrap")
    async let voice: VoiceStatus? = try? await app.call("voice/status")
    guard let boot = await boot else { return }
    let status = await voice
    let space = boot.spaces.first { $0.id == boot.me.spaceId }
    options = Options(
      spaceID: boot.me.spaceId, policy: space?.meetingRecording ?? "remind",
      serverTranscribes: status.map {
        ($0.transcribe || $0.transcriptionReady) && $0.transcriptionConsented != false
      } ?? false)
  }
}

/// The sheet behind Record: an optional title, the space's recording notice, and Start.
struct RecordSheet: View {
  let options: RecordModel.Options
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var title = ""
  @State private var agreed = false
  @State private var failure: String?
  @State private var starting = false

  private var placeholder: String {
    "Meeting \(Date.now.formatted(date: .omitted, time: .shortened))"
  }

  private var confirm: Bool { options.policy == "confirm" }

  var body: some View {
    NavigationStack {
      if options.serverTranscribes {
        form
      } else {
        Form {
          NavigationLink("Add speech to text") { VoiceSettingsScreen() }
            .accessibilityIdentifier("addSpeechToText")
        }
        .toolbar { cancel }
      }
    }
    .presentationDetents([.medium])
  }

  private var form: some View {
    Form {
      Section {
        TextField("Title", text: $title, prompt: Text(placeholder))
          .accessibilityIdentifier("recordTitle")
        if confirm {
          Toggle("Everyone agreed to be recorded", isOn: $agreed)
            .accessibilityIdentifier("recordConsent")
        }
      } footer: {
        if !confirm { Text("Tell everyone you're recording.") }
        if let failure { Text(failure).foregroundStyle(Color.token(.destructive)) }
      }
    }
    .toolbar {
      cancel
      ToolbarItem(placement: .confirmationAction) {
        Button("Start") { Task { await start() } }
          .disabled(starting || (confirm && !agreed))
          .accessibilityIdentifier("recordStart")
      }
    }
  }

  private var cancel: some ToolbarContent {
    ToolbarItem(placement: .cancellationAction) {
      Button("Cancel") { dismiss() }.accessibilityIdentifier("recordCancel")
    }
  }

  private func start() async {
    starting = true
    failure = nil
    defer { starting = false }
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    do {
      try await app.capture.start(
        spaceID: options.spaceID, title: trimmed.isEmpty ? placeholder : trimmed,
        consentConfirmed: confirm && agreed)
      dismiss()
    } catch {
      failure = error.localizedDescription
    }
  }
}
