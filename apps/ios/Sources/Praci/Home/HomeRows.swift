import RakazoAPI
import SwiftUI

struct AgentRowView: View {
  let row: RosterRow
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .headline) private var avatarSize = 40

  var body: some View {
    HStack(alignment: dynamicTypeSize.isAccessibilitySize ? .top : .center, spacing: 12) {
      BotAvatarView(name: row.name, avatar: row.color, size: avatarSize)
      VStack(alignment: .leading, spacing: 2) {
        let stamp = Text(rowTimestamp(row.updatedAt)).font(.subheadline)
          .foregroundStyle(Color.token(.mutedForeground))
        let dot = Circle().fill(Color.token(.primary)).frame(width: 8, height: 8)
          .accessibilityLabel("Unread")
        if dynamicTypeSize.isAccessibilitySize {
          // Large text: name gets the full width, time and unread dot sit on their own line.
          Text(row.name).font(.headline).lineLimit(2)
          HStack(spacing: 6) {
            if row.unread { dot }
            stamp
          }
        } else {
          HStack {
            Text(row.name).font(.headline).lineLimit(1)
            Spacer(minLength: 8)
            if row.unread { dot }
            stamp
          }
        }
        Text(subtitle).font(.subheadline).lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
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
