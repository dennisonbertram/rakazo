import RakazoAPI
import SwiftUI
import UIKit

/// Menu items for one message. Wave 3 adds reply, react and the rest.
struct MessageActions: View {
  let message: ThreadMessage
  let model: ThreadModel

  var body: some View {
    let text = message.blocks.compactMap(\.text).joined(separator: "\n\n")
    if !text.isEmpty {
      Button { UIPasteboard.general.string = text } label: {
        Label("Copy", systemImage: "doc.on.doc")
      }
    }
  }
}
