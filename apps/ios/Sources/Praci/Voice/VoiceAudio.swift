import AVFoundation
import Foundation
import RakazoCore
import Speech

/// Microphone and speech-recognition permissions, and the one audio session calls and dictation share.
enum VoiceAudio {
  static let micDenied =
    "Allow microphone access in Settings to talk to your agent."
  static let speechDenied =
    "Allow speech recognition in Settings to dictate."

  /// Asks for the microphone (the system prompt shows once). False when it is denied.
  static func requestMicrophone() async -> Bool {
    await AVAudioApplication.requestRecordPermission()
  }

  /// Asks for speech recognition. False when denied or the device cannot recognise speech.
  static func requestSpeech() async -> Bool {
    let status = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
    }
    return status == .authorized && recognizer()?.isAvailable == true
  }

  static func recognizer() -> SFSpeechRecognizer? {
    SFSpeechRecognizer(locale: Locale(identifier: language))
  }

  /// The user's first preferred language, which is what the recognizer is asked to hear.
  static var language: String { Locale.preferredLanguages.first ?? "en-US" }

  /// Play and record together, with the system's echo cancellation for speech.
  static func activate() throws {
    let session = AVAudioSession.sharedInstance()
    #if targetEnvironment(simulator)
      // The simulator's audio host cannot start voice-processing input; plain recording works.
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
    #else
      try session.setCategory(
        .playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
    #endif
    try session.setActive(true)
  }

  static func deactivate() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
