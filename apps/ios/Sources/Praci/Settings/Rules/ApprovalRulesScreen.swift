import Observation
import RakazoAPI
import SwiftUI

struct SetRuleInput: Encodable, Sendable {
  var effect: String
  var matchKind: String
  var matchValue: String
}
struct RuleIDInput: Encodable, Sendable { var id: String }
struct AutoReviewInput: Encodable, Sendable { var enabled: Bool }

struct RulesSnapshot: Sendable {
  var rules: [ApprovalRule]
  var autoReview: AutoReview
}

@MainActor
@Observable
final class RulesModel {
  var state: Loadable<RulesSnapshot> = .idle
  var error: String?

  func load(_ app: AppModel) async {
    if state.value == nil { state = .loading }
    do {
      async let rules: [ApprovalRule] = app.call("approvalRules/list")
      async let review: AutoReview = app.call("autoReview/get")
      state = .loaded(try await RulesSnapshot(rules: rules, autoReview: review))
    } catch {
      state = .failed(settingsErrorText(error))
    }
  }

  func set(_ app: AppModel, effect: String, kind: String, value: String) async -> Bool {
    await run(app) {
      let _: ApprovalRule = try await app.call(
        "approvalRules/set",
        input: SetRuleInput(effect: effect, matchKind: kind, matchValue: value))
    }
  }

  func remove(_ app: AppModel, _ rule: ApprovalRule) async {
    _ = await run(app) {
      let _: OKResult = try await app.call("approvalRules/remove", input: RuleIDInput(id: rule.id))
    }
  }

  func setAutoReview(_ app: AppModel, _ enabled: Bool) async {
    _ = await run(app) {
      let _: AutoReview = try await app.call("autoReview/set", input: AutoReviewInput(enabled: enabled))
    }
  }

  private func run(_ app: AppModel, _ call: () async throws -> Void) async -> Bool {
    error = nil
    do {
      try await call()
      await load(app)
      return true
    } catch {
      self.error = settingsErrorText(error)
      return false
    }
  }
}

struct ApprovalRulesScreen: View {
  @Environment(AppModel.self) private var app
  @State private var model = RulesModel()
  @State private var adding = false

  private static let effects: [(String, LocalizedStringKey)] = [
    ("always_allow", "Allow"), ("require_approval", "Ask"), ("block", "Block"),
  ]

  var body: some View {
    LoadableView(state: model.state, retry: { Task { await model.load(app) } }) { snapshot in
      List {
        Section {
          Toggle(
            "Review actions automatically",
            isOn: Binding(
              get: { snapshot.autoReview.enabled },
              set: { on in Task { await model.setAutoReview(app, on) } })
          )
          .disabled(!snapshot.autoReview.checkerAvailable)
          .accessibilityIdentifier("autoReview")
        }
        Section {
          ForEach(snapshot.rules) { rule in
            LabeledContent {
              Menu {
                ForEach(Self.effects, id: \.0) { effect in
                  Button(effect.1) {
                    Task {
                      _ = await model.set(
                        app, effect: effect.0, kind: rule.matchKind, value: rule.matchValue)
                    }
                  }
                }
              } label: {
                Text(Self.effects.first { $0.0 == rule.effect }?.1 ?? "Ask")
              }
            } label: {
              VStack(alignment: .leading) {
                Text(rule.matchValue.capitalized)
                Text(rule.matchKind.capitalized).font(.caption)
                  .foregroundStyle(Color.token(.mutedForeground))
              }
            }
            .swipeActions {
              Button("Remove", role: .destructive) { Task { await model.remove(app, rule) } }
            }
            .accessibilityIdentifier("rule-\(rule.matchValue)")
          }
        } header: {
          Text("Rules")
        } footer: {
          if let error = model.error {
            Text(error).foregroundStyle(Color.token(.destructive))
          } else {
            Text("Background runs always ask before they send, change or run anything.")
          }
        }
      }
      .overlay {
        if snapshot.rules.isEmpty {
          ContentUnavailableView("No rules", systemImage: "checkmark.shield")
        }
      }
    }
    .navigationTitle("Approval rules")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Add rule", systemImage: "plus") { adding = true }
          .accessibilityIdentifier("addRule")
      }
    }
    .task { await model.load(app) }
    .refreshable { await model.load(app) }
    .sheet(isPresented: $adding) { AddRuleSheet(model: model) }
  }
}

private struct AddRuleSheet: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let model: RulesModel
  @State private var kind = "tool"
  @State private var value = ""
  @State private var effect = "require_approval"

  var body: some View {
    NavigationStack {
      Form {
        Picker("Applies to", selection: $kind) {
          Text("Tool").tag("tool")
          Text("Connector").tag("connector")
          Text("Category").tag("category")
          Text("Site").tag("site")
        }
        TextField("Name", text: $value)
          .autocorrectionDisabled()
          .textInputAutocapitalization(.never)
          .accessibilityIdentifier("ruleValue")
        Picker("Action", selection: $effect) {
          Text("Allow").tag("always_allow")
          Text("Ask").tag("require_approval")
          Text("Block").tag("block")
        }
        if let error = model.error { Text(error).foregroundStyle(Color.token(.destructive)) }
      }
      .navigationTitle("Add rule")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            Task {
              if await model.set(
                app, effect: effect, kind: kind,
                value: value.trimmingCharacters(in: .whitespacesAndNewlines))
              {
                dismiss()
              }
            }
          }
          .disabled(value.trimmingCharacters(in: .whitespaces).isEmpty)
          .accessibilityIdentifier("saveRule")
        }
      }
    }
    .presentationDetents([.medium])
  }
}
