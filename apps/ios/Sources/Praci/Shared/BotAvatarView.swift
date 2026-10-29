import SwiftUI

struct BotAvatarView: View {
  let name: String
  let avatar: String?
  let size: CGFloat

  var body: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.system(size: size * 0.45, weight: .semibold))
      .frame(width: size, height: size)
      .background(Color.token(.muted), in: Circle())
      .accessibilityHidden(true)
  }
}
