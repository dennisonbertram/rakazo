import SwiftUI

struct ConsentSheet: View {
  let procedure: String
  let onDone: (Bool) -> Void

  var body: some View { Text("Consent") }
}
