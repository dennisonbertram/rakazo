import Foundation
import Testing

@testable import RakazoCore

private typealias K = ComputerKeyboard
private let seed = K.seed
private func ch(_ b: Int, _ t: String) -> ComputerKeyboardChanges {
  ComputerKeyboardChanges(backspaces: b, text: t)
}

@Test func translatesInsertedAndDeletedText() {
  #expect(K.changes(from: "___", to: "___a") == ch(0, "a"))
  #expect(K.changes(from: "___a", to: "___") == ch(1, ""))
}

@Test func returnBecomesAnEnterCommandAndTheDraftStaysStocked() {
  let edit = K.normalizeEdit(seed, "\(seed)a\n")
  #expect(edit.changes == ch(0, "a\n"))
  #expect(edit.draft.hasSuffix("a\n"))
  #expect(K.commands(for: edit.changes, control: false) == [.text("a"), .key(.return)])
  #expect(K.nextDraft("") == seed)
}

@Test func keepsAReturnBetweenCharactersOnEitherSide() {
  let abc: [ComputerKeyboardCommand] = [.text("a"), .key(.return), .text("b")]
  let pasted = K.normalizeEdit(seed, "\(seed)a\nb")
  #expect(pasted.changes == ch(0, "a\nb"))
  #expect(K.commands(for: pasted.changes, control: false) == abc)
  let windows = K.normalizeEdit(seed, "\(seed)a\r\nb")
  #expect(windows.draft.hasSuffix("a\nb"))
  #expect(windows.changes == ch(0, "a\nb"))
  #expect(K.commands(for: windows.changes, control: false) == abc)
}

@Test func laterBackspacesStayOnTheRemoteReturn() {
  let pasted = K.normalizeEdit(seed, "\(seed)a\nb")
  let deletedB = K.normalizeEdit(pasted.draft, String(pasted.draft.dropLast()))
  #expect(deletedB.changes == ch(1, ""))
  #expect(deletedB.draft.hasSuffix("a\n"))
  let deletedReturn = K.normalizeEdit(deletedB.draft, String(deletedB.draft.dropLast()))
  #expect(deletedReturn.changes == ch(1, ""))
  #expect(deletedReturn.draft.hasSuffix("a") && !deletedReturn.draft.contains("\n"))
  let deletedA = K.normalizeEdit(deletedReturn.draft, String(deletedReturn.draft.dropLast()))
  #expect(deletedA.changes == ch(1, ""))
  #expect(deletedA.draft == seed)
  #expect(K.normalizeEdit(pasted.draft, seed).changes == ch(3, ""))
}

@Test func rejectsADeletionThatEntersTheUnsentSeed() {
  let intoSeed = K.normalizeEdit(seed, String(seed.dropLast()))
  #expect(!intoSeed.aligned && intoSeed.draft == seed && intoSeed.changes == ch(0, ""))
  let cleared = K.normalizeEdit(seed, "")
  #expect(!cleared.aligned && cleared.draft == seed)
  let partial = String(seed.prefix(40))
  #expect(!K.isRemoteAlignedEdit(partial, String(partial.dropLast())))
  #expect(K.isRemoteAlignedEdit(partial, "\(partial)a"))
  let typed = K.normalizeEdit(seed, "\(seed)a")
  let deletedTyped = K.normalizeEdit(typed.draft, seed)
  #expect(deletedTyped.aligned && deletedTyped.changes == ch(1, "") && deletedTyped.draft == seed)
  let across = K.normalizeEdit(typed.draft, String(seed.dropLast()))
  #expect(!across.aligned && across.draft == typed.draft && across.changes == ch(0, ""))
}

@Test func dropsAnEditInsideThePaddingAndKeepsACorrectionInTheTypedSuffix() {
  let draft = "\(seed)ab"
  #expect(K.padding(draft) == seed.count)
  let insideSeed = "\(seed.dropLast())X_ab"
  #expect(!K.isRemoteAlignedEdit(draft, insideSeed))
  let edit = K.normalizeEdit(draft, insideSeed)
  #expect(!edit.aligned && edit.draft == draft)
  #expect(K.commands(for: edit.changes, control: true).isEmpty)
  let corrected = K.normalizeEdit("\(seed)recieve", "\(seed)receive")
  #expect(corrected.aligned && corrected.changes == ch(4, "eive"))
}

@Test func controlIsAChordOnOnlyTheNextKey() {
  #expect(K.commands(for: ch(0, "c"), control: true) == [.char("c", control: true)])
  #expect(K.commands(for: ch(0, "cd"), control: true) == [.char("c", control: true), .text("d")])
  #expect(
    K.commands(for: ch(2, "e"), control: true)
      == [.key(.backspace, control: true), .backspace(count: 1), .text("e")])
  #expect(
    K.commands(for: ch(0, "\nb"), control: true) == [.key(.return, control: true), .text("b")])
  #expect(K.commands(for: ch(2, ""), control: false) == [.backspace(count: 2)])
}

@Test func commandsAreEmbeddedAsJSONThatCannotBreakOutOfTheInjectedCall() throws {
  let text = "</script>\u{2028}\");alert(1)"
  let script = K.script(for: .text(text))
  let prefix = "window.rakazoComputerKeyboard?.run("
  #expect(script.hasPrefix(prefix) && script.hasSuffix(");true;"))
  let json = String(script.dropFirst(prefix.count).dropLast(");true;".count))
  #expect(!json.contains("<") && !json.contains("\u{2028}"))
  let object = try #require(
    JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: String])
  #expect(object == ["type": "text", "text": text])
  #expect(K.script(for: .key(.return, control: true)).contains(#""control":true"#))
  #expect(K.script(for: .key(.tab)).contains(#""name":"Tab""#))
}

@Test func queuesCommandsUntilTheBridgeIsReady() {
  var bridge = ComputerKeyboardBridge()
  let text = ComputerKeyboardCommand.text("a")
  let enter = ComputerKeyboardCommand.key(.return)
  #expect(bridge.push(text).isEmpty && bridge.push(enter).isEmpty)
  #expect(bridge.ready() == [text, enter])
  #expect(bridge.isReady)
  #expect(bridge.push(text) == [text])
  #expect(bridge.ready().isEmpty)
  var next = ComputerKeyboardBridge()
  #expect(!next.isReady && next.push(enter).isEmpty)
  #expect(next.ready() == [enter])
}

@Test func readyProbePostsOnceTheBridgeExists() {
  let script = K.readyProbe(session: "1\"</script>")
  #expect(script.hasSuffix(";true;"))
  #expect(script.contains("window.rakazoComputerKeyboard"))
  #expect(script.contains("ReactNativeWebView.postMessage"))
  #expect(!script.contains("<"))
  #expect(K.isReadyMessage("\(K.readyMessage):4", session: "4"))
  #expect(!K.isReadyMessage("\(K.readyMessage):4", session: "5"))
}
