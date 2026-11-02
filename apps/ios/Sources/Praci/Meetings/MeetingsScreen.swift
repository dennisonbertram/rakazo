import RakazoAPI
import SwiftUI

struct MeetingsScreen: View {
  @Environment(AppModel.self) private var app
  @State private var model = MeetingsModel()
  @State private var query = ""

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.load(app, query: query) } }, content: { meetings in
      if meetings.isEmpty {
        if query.isEmpty {
          ContentUnavailableView("No meetings", systemImage: "waveform")
        } else {
          ContentUnavailableView.search(text: query)
        }
      } else {
        List {
          ForEach(meetings) { meeting in
            NavigationLink(value: Route.meeting(id: meeting.id)) {
              VStack(alignment: .leading, spacing: 2) {
                Text(meeting.title)
                Text(meeting.subtitle).font(.footnote).foregroundStyle(Color.token(.mutedForeground))
              }
            }
            .accessibilityIdentifier("meetingRow")
            .task { if meeting.id == meetings.last?.id { await model.loadMore(app, query: query) } }
          }
        }
        .listStyle(.plain)
      }
    })
    .background(Color.token(.background))
    .navigationTitle("Meetings")
    .navigationBarTitleDisplayMode(.inline)
    .searchable(text: $query)
    // T3: the Record button goes here as a .topBarTrailing ToolbarItem.
    .task(id: query) {
      if !query.isEmpty { try? await Task.sleep(for: .milliseconds(250)) }
      if Task.isCancelled { return }
      await model.load(app, query: query.trimmingCharacters(in: .whitespaces))
    }
    .refreshable { await model.load(app, query: query) }
  }
}
