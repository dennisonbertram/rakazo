import SwiftUI

enum Loadable<T> {
  case idle
  case loading
  case loaded(T)
  case failed(String)

  var value: T? {
    if case .loaded(let value) = self { value } else { nil }
  }
}

extension Loadable: Sendable where T: Sendable {}

struct LoadableView<T, Content: View>: View {
  let state: Loadable<T>
  let retry: () -> Void
  @ViewBuilder let content: (T) -> Content

  var body: some View {
    switch state {
    case .idle, .loading:
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    case .loaded(let value):
      content(value)
    case .failed(let message):
      ContentUnavailableView {
        Label("Couldn’t load", systemImage: "exclamationmark.triangle")
      } description: {
        Text(message)
      } actions: {
        Button("Try again", action: retry)
      }
    }
  }
}
