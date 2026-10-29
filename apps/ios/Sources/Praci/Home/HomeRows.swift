import RakazoAPI
import SwiftUI

struct AgentRowView: View {
  let row: RosterRow

  var body: some View {
    HStack(spacing: 12) {
      BotAvatarView(name: row.name, avatar: nil, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        HStack {
          Text(row.name).font(.headline).lineLimit(1)
          Spacer(minLength: 8)
          if row.unread {
            Circle().fill(Color.token(.primary)).frame(width: 8, height: 8)
              .accessibilityLabel("Unread")
          }
          Text(rowTimestamp(row.updatedAt)).font(.subheadline)
            .foregroundStyle(Color.token(.mutedForeground))
        }
        Text(subtitle).font(.subheadline).lineLimit(1)
          .foregroundStyle(Color.token(.mutedForeground))
      }
    }
    .accessibilityElement(children: .combine)
  }

  private var subtitle: String {
    switch row.status {
    case .waitingInput: String(localized: "Needs you")
    case .running: String(localized: "Working")
    default: row.preview
    }
  }
}

struct PageRowView: View {
  let title: LocalizedStringKey
  let systemImage: String

  var body: some View {
    Label {
      Text(title)
    } icon: {
      Image(systemName: systemImage).foregroundStyle(Color.token(.foreground))
    }
  }
}
