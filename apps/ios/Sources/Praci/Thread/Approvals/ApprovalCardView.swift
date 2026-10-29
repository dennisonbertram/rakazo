import RakazoAPI
import SwiftUI

/// Read-only card for blocks that wait on, or record, a decision. Wave 3 makes it interactive.
struct ApprovalCardView: View {
  let block: MessageBlock
  let messageID: String
  let model: ThreadModel

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(heading).font(.subheadline.weight(.semibold))
      if let detail = block.fields["detail"]?.stringValue {
        Text(detail).font(.footnote).foregroundStyle(Color.token(.mutedForeground))
      }
      if let lines = block.cardLines {
        ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
          HStack(alignment: .firstTextBaseline) {
            Text(line.k).foregroundStyle(Color.token(.mutedForeground))
            Spacer(minLength: 8)
            Text(line.v).multilineTextAlignment(.trailing)
          }
          .font(.footnote)
        }
      }
      Text(statusText).font(.footnote).foregroundStyle(Color.token(.mutedForeground))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background(Color.token(.card), in: RoundedRectangle(cornerRadius: 14))
    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.token(.border)))
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("approvalCard")
  }

  private var heading: String {
    block.question ?? block.text ?? block.title
      ?? String(localized: "Waiting on you")
  }

  private var statusText: LocalizedStringKey {
    if let answer = block.fields["answer"]?.stringValue { return "Answered: \(answer)" }
    switch block.status {
    case "answered", "approved", "done": return "Answered"
    case "dismissed", "declined", "rejected": return "Declined"
    default: return "Needs your answer"
    }
  }
}
