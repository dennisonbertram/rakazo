import RakazoAPI
import SwiftUI
import UIKit

/// Agent markdown as native text: headings, lists, quotes, fenced code and tables.
struct MarkdownView: View {
  let text: String
  var color: Color = Color.token(.foreground)

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(Array(parseMarkdown(text).enumerated()), id: \.offset) { _, block in
        view(block)
      }
    }
    .foregroundStyle(color)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder private func view(_ block: MarkdownBlock) -> some View {
    switch block {
    case .paragraph(let text): Text(inlineMarkdown(text)).font(.body)
    case .heading(let level, let text):
      Text(inlineMarkdown(text)).font(level == 1 ? .title3.bold() : .headline)
    case .bullet(let text):
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text("•")
        Text(inlineMarkdown(text))
      }
      .font(.body)
    case .numbered(let number, let text):
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text("\(number).").monospacedDigit()
        Text(inlineMarkdown(text))
      }
      .font(.body)
    case .quote(let text):
      Text(inlineMarkdown(text)).font(.body)
        .foregroundStyle(Color.token(.mutedForeground))
        .padding(.leading, 10)
        .overlay(alignment: .leading) {
          Rectangle().fill(Color.token(.border)).frame(width: 3)
        }
    case .code(_, let text):
      Text(text).font(.footnote.monospaced())
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.token(.background), in: RoundedRectangle(cornerRadius: 10))
    case .table(let rows): TableView(rows: rows)
    case .rule: Divider()
    }
  }
}

private struct TableView: View {
  let rows: [[String]]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
        ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
          GridRow {
            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
              Text(inlineMarkdown(cell)).font(index == 0 ? .footnote.bold() : .footnote)
            }
          }
        }
      }
    }
  }
}

/// A quiet one-line label for tool work; tapping a finished step shows what it did.
struct ToolLabel: View {
  let title: String
  var summary: String?
  var lines: [String] = []
  var running = false
  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button { expanded.toggle() } label: {
        HStack(spacing: 6) {
          if running {
            ProgressView().controlSize(.small)
          } else {
            Image(systemName: "wrench.and.screwdriver").font(.footnote)
          }
          Text(title).font(.footnote)
          if hasDetail { Image(systemName: expanded ? "chevron.down" : "chevron.right").font(.caption2) }
        }
        .foregroundStyle(Color.token(.mutedForeground))
        .frame(minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(!hasDetail)
      if expanded {
        VStack(alignment: .leading, spacing: 4) {
          if let summary { Text(summary) }
          ForEach(Array(lines.enumerated()), id: \.offset) { _, line in Text(line) }
        }
        .font(.footnote)
        .foregroundStyle(Color.token(.mutedForeground))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.token(.card), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.token(.border)))
      }
    }
    .accessibilityIdentifier("toolLabel")
  }

  private var hasDetail: Bool { summary != nil || !lines.isEmpty }
}

private struct StepLine: Decodable {
  var label: String
  var count: Int?
  var summary: String?
  var lines: [Line]?
  struct Line: Decodable { var text: String }
}

struct StepsBlockView: View {
  let block: MessageBlock

  var body: some View {
    let steps = (try? block.field("steps", as: [StepLine].self)) ?? []
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
        ToolLabel(
          title: (step.count ?? 1) > 1 ? "\(step.label) ×\(step.count ?? 1)" : step.label,
          summary: step.summary, lines: (step.lines ?? []).map(\.text))
      }
    }
  }
}

struct SubagentRowView: View {
  let block: MessageBlock

  var body: some View {
    let name = block.fields["name"]?.stringValue ?? "subagent"
    let done = block.status == "completed"
    let failed = block.status == "failed"
    ToolLabel(
      title: failed ? "\(name) failed" : done ? "\(name) finished" : "\(name) is working",
      summary: block.fields["result"]?.stringValue ?? block.fields["progress"]?.stringValue,
      running: !done && !failed)
  }
}

/// Shows an artifact image. It is fetched through the signed-in session, so a plain
/// `AsyncImage` could not authorise the request.
struct ImageBlockView: View {
  let block: MessageBlock
  @Environment(AppModel.self) private var app
  @State private var state: Loadable<UIImage> = .idle

  private struct Input: Encodable, Sendable { var artifactId: String }
  private struct Output: Decodable, Sendable { var contentBase64: String }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      switch state {
      case .loaded(let image):
        Image(uiImage: image).resizable().scaledToFit()
          .clipShape(RoundedRectangle(cornerRadius: 14))
          .accessibilityLabel(block.fields["alt"]?.stringValue ?? block.fields["name"]?.stringValue ?? "Image")
      case .failed:
        Button("Couldn’t load image. Try again") { state = .idle }
          .font(.footnote)
          .frame(maxWidth: .infinity, minHeight: 80)
          .background(Color.token(.card), in: RoundedRectangle(cornerRadius: 14))
      default:
        ProgressView().frame(maxWidth: .infinity, minHeight: 120)
          .background(Color.token(.card), in: RoundedRectangle(cornerRadius: 14))
      }
      if let caption = block.fields["caption"]?.stringValue {
        Text(caption).font(.footnote).foregroundStyle(Color.token(.mutedForeground))
      }
    }
    .task(id: loadKey) { await load() }
  }

  private var loadKey: String {
    "\(block.fields["artifactId"]?.stringValue ?? "")|\(isIdle)"
  }

  private var isIdle: Bool { if case .idle = state { true } else { false } }

  private func load() async {
    guard case .idle = state, let id = block.fields["artifactId"]?.stringValue else { return }
    state = .loading
    do {
      let out: Output = try await app.call("artifacts/getById", input: Input(artifactId: id), timeout: 30)
      if let data = Data(base64Encoded: out.contentBase64), let image = UIImage(data: data) {
        state = .loaded(image)
      } else {
        state = .failed("")
      }
    } catch {
      state = .failed(error.localizedDescription)
    }
  }
}

struct FileBlockView: View {
  let block: MessageBlock

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "doc").foregroundStyle(Color.token(.mutedForeground))
      VStack(alignment: .leading, spacing: 2) {
        Text(block.fields["name"]?.stringValue ?? "File").font(.subheadline).lineLimit(2)
        if case .number(let size)? = block.fields["size"] {
          Text(Int64(size).formatted(.byteCount(style: .file)))
            .font(.caption).foregroundStyle(Color.token(.mutedForeground))
        }
      }
      Spacer(minLength: 0)
    }
    .padding(12)
    .background(Color.token(.card), in: RoundedRectangle(cornerRadius: 14))
    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.token(.border)))
    .accessibilityElement(children: .combine)
  }
}

/// Kinds this version of the app cannot draw yet.
struct UnsupportedBlockView: View {
  var body: some View {
    Label("This content isn’t available in this version.", systemImage: "square.dashed")
      .font(.footnote)
      .foregroundStyle(Color.token(.mutedForeground))
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color.token(.card), in: RoundedRectangle(cornerRadius: 14))
      .accessibilityIdentifier("unsupportedBlock")
  }
}
