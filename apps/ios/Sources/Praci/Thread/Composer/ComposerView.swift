import SwiftUI

/// Wave 3 replaces this with the real composer; until then it is a disabled field.
struct ComposerView: View {
  let model: ThreadModel

  var body: some View {
    TextField("Message \(model.title)", text: .constant(""))
      .disabled(true)
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .background(Color.token(.card), in: Capsule())
      .overlay(Capsule().stroke(Color.token(.border)))
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .accessibilityIdentifier("composer")
  }
}
