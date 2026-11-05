import RakazoAPI
import SwiftUI

/// "Paused" or "Waiting on you" when the goal is not making progress; nil while it is working.
func goalStatus(_ goal: ThreadGoal, run: ThreadRun?) -> String? {
  if goal.status == "paused" { return "Paused" }
  if goal.status == "active", run?.status == "waiting_input" { return "Waiting on you" }
  return nil
}

/// How a goal ended: "Goal met", "Goal blocked" or "Goal stopped", then the reason.
struct GoalBlockView: View {
  let block: MessageBlock

  var body: some View {
    let outcome = block.fields["outcome"]?.stringValue
    let reason = block.fields["reason"]?.stringValue ?? ""
    if let title = outcome.flatMap(Self.title) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.footnote.weight(.semibold))
        if !reason.isEmpty { Text(reason).font(.footnote) }
      }
      .foregroundStyle(Color.token(.mutedForeground))
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("goalBlock")
    } else if let text = block.text, !text.isEmpty {
      // An outcome this version does not know: the plain line the server always sends.
      Text(verbatim: text).font(.footnote).foregroundStyle(Color.token(.mutedForeground))
    }
  }

  static func title(_ outcome: String) -> String? {
    switch outcome {
    case "met": "Goal met"
    case "blocked": "Goal blocked"
    case "stopped": "Goal stopped"
    default: nil
    }
  }
}
