// @vitest-environment jsdom
import type { AgentSkillCatalogEntry, Routine } from "@rakazo/contracts";
import { presetFromCron } from "@rakazo/core";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ i18n: { locale: "en" }, t: (parts: TemplateStringsArray) => parts.join("") }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../lib/rpc", () => ({
  rpc: { models: { credentials: async () => [], list: async () => [] } },
}));

import {
  emptyRoutineDraft,
  RoutineEditor,
  RoutineListHeader,
  routineStatusLine,
  routineTriggerSummary,
} from "./RoutineEditor";

async function buttons(editing: Routine | null) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  const noop = () => undefined;
  await act(async () =>
    root.render(
      <RoutineEditor
        draft={emptyRoutineDraft()}
        onChange={noop}
        editing={editing}
        timezone="America/New_York"
        webhook={{ path: "/hook", secret: null, configured: false }}
        githubPath="/gh"
        messageProviders={[]}
        saving={false}
        running={false}
        error={null}
        onBack={noop}
        onClose={noop}
        onSave={noop}
        onTestRun={noop}
        onDelete={noop}
        onEnsureWebhook={async () => undefined}
      />,
    ),
  );
  const names = [...el.querySelectorAll("button")].map((button) => button.textContent);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  return names;
}

it("offers Delete only once the routine has been saved", async () => {
  expect(await buttons(null)).not.toContain("Delete");
  expect(await buttons({ id: "routine-1" } as Routine)).toContain("Delete");
});

it("asks when a new routine runs in plain words, without webhook or GitHub jargon", async () => {
  const names = await buttons(null);
  expect(names).toContain("Choose when it runs");
  expect(names).not.toContain("Add trigger");
});

it("lets an existing routine's time zone be changed in Advanced", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  const noop = () => undefined;
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <RoutineEditor
        draft={{ ...emptyRoutineDraft(), timezone: "America/Chicago" }}
        onChange={onChange}
        editing={{ id: "routine-1", timezone: "America/Chicago" } as Routine}
        timezone="America/Chicago"
        webhook={{ path: "/hook", secret: null, configured: false }}
        githubPath="/gh"
        messageProviders={[]}
        saving={false}
        running={false}
        error={null}
        onBack={noop}
        onClose={noop}
        onSave={noop}
        onTestRun={noop}
        onDelete={noop}
        onEnsureWebhook={async () => undefined}
      />,
    ),
  );
  await act(async () => {
    (el.querySelector('button[aria-label="Advanced"]') as HTMLButtonElement).click();
  });
  const select = document.querySelector("select") as HTMLSelectElement;
  expect(select.value).toBe("America/Chicago");
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

it("keeps Save off for a saved routine until a field changes, and shows its next run", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  const noop = () => undefined;
  const editing = {
    id: "routine-1",
    timezone: "America/Chicago",
    crons: ["0 9 * * 1"],
    nextRunAt: "2026-10-26T14:00:00.000Z",
    lastRunAt: null,
  } as Routine;
  const draft = { ...emptyRoutineDraft(), schedules: [presetFromCron("0 9 * * 1")] };
  const render = (next: typeof draft) =>
    act(async () =>
      root.render(
        <RoutineEditor
          draft={next}
          onChange={noop}
          editing={editing}
          timezone="America/Chicago"
          webhook={{ path: "/hook", secret: null, configured: false }}
          githubPath="/gh"
          messageProviders={[]}
          saving={false}
          running={false}
          error={null}
          onBack={noop}
          onClose={noop}
          onSave={noop}
          onTestRun={noop}
          onDelete={noop}
          onEnsureWebhook={async () => undefined}
        />,
      ),
    );
  const save = () =>
    [...el.querySelectorAll("button")].find((button) => button.textContent === "Save");
  await render(draft);
  expect(save()).toBeUndefined();
  // Nothing edited: the button keeps saying "Saved", not "Save", so a Test run does not look like an edit.
  const saved = [...el.querySelectorAll("button")].find((b) => b.textContent === "Saved");
  expect(saved?.disabled).toBe(true);
  expect(el.textContent).toContain("Next run");
  await render({ ...draft, name: "Monday cash check" });
  expect(save()?.disabled).toBe(false);
  expect(el.textContent).not.toContain("Next run");
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

it("labels the routine list's create button in words, visible without hovering", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  await act(async () => root.render(<RoutineListHeader onCreate={() => undefined} />));
  expect(el.querySelector("button")?.textContent).toBe("Create a routine");
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

it("adds the chosen skill to the instruction as an @mention", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  const noop = () => undefined;
  const onChange = vi.fn();
  const skills = [
    { id: "s1", name: "Weekly cash check", description: "", source: "user", readOnly: false },
  ] as AgentSkillCatalogEntry[];
  await act(async () =>
    root.render(
      <RoutineEditor
        draft={{ ...emptyRoutineDraft(), prompt: "Every Monday." }}
        onChange={onChange}
        editing={null}
        timezone="America/New_York"
        webhook={{ path: "/hook", secret: null, configured: false }}
        githubPath="/gh"
        messageProviders={[]}
        skills={skills}
        saving={false}
        running={false}
        error={null}
        onBack={noop}
        onClose={noop}
        onSave={noop}
        onTestRun={noop}
        onDelete={noop}
        onEnsureWebhook={async () => undefined}
      />,
    ),
  );
  const select = el.querySelector('select[aria-label="Add a skill"]') as HTMLSelectElement;
  expect(select).not.toBeNull();
  await act(async () => {
    select.value = "Weekly cash check";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: "@Weekly cash check Every Monday." }),
  );
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

it("shows a forced skill in the picker and keeps the instruction plain", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  const noop = () => undefined;
  const skills = [
    { id: "b1", name: "daily-brief", description: "", source: "builtin", readOnly: true },
    { id: "s1", name: "investor-update", description: "", source: "user", readOnly: false },
    { id: "p1", name: "ship-notes", description: "", source: "plugin", readOnly: true },
  ] as AgentSkillCatalogEntry[];
  await act(async () =>
    root.render(
      <RoutineEditor
        draft={{ ...emptyRoutineDraft(), prompt: "@investor-update Draft the note." }}
        onChange={noop}
        editing={null}
        timezone="America/New_York"
        webhook={{ path: "/hook", secret: null, configured: false }}
        githubPath="/gh"
        messageProviders={[]}
        skills={skills}
        saving={false}
        running={false}
        error={null}
        onBack={noop}
        onClose={noop}
        onSave={noop}
        onTestRun={noop}
        onDelete={noop}
        onEnsureWebhook={async () => undefined}
      />,
    ),
  );
  const select = el.querySelector('select[aria-label="Add a skill"]') as HTMLSelectElement;
  expect(select.value).toBe("investor-update");
  expect((el.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Draft the note.");
  expect(Array.from(select.options)[1]?.value).toBe("investor-update");
  const groupOf = (value: string) =>
    (select.querySelector(`option[value="${value}"]`) as HTMLElement).parentElement?.getAttribute(
      "label",
    );
  expect(groupOf("daily-brief")).toBe("Built-in");
  expect(groupOf("ship-notes")).toBe("Plugins");
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

it("keeps @mentions in the instruction when there are no skills to pick", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  const noop = () => undefined;
  await act(async () =>
    root.render(
      <RoutineEditor
        draft={{ ...emptyRoutineDraft(), prompt: "Send the update to @alice every Monday." }}
        onChange={noop}
        editing={null}
        timezone="America/New_York"
        webhook={{ path: "/hook", secret: null, configured: false }}
        githubPath="/gh"
        messageProviders={[]}
        skills={[]}
        saving={false}
        running={false}
        error={null}
        onBack={noop}
        onClose={noop}
        onSave={noop}
        onTestRun={noop}
        onDelete={noop}
        onEnsureWebhook={async () => undefined}
      />,
    ),
  );
  expect((el.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
    "Send the update to @alice every Monday.",
  );
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

const baseRoutine = {
  crons: [],
  timezone: "UTC",
  active: true,
  webhookEnabled: false,
  githubEnabled: false,
  messageProvider: null,
  watch: null,
  managedKind: null,
  status: {
    lastRunAt: null,
    nextRunAt: null,
    lastCheckedAt: null,
    lastChangedAt: null,
    pausedReason: null,
  },
} as unknown as Routine;

it("describes a watch, a check-in and a pause in the row", () => {
  const now = new Date("2026-02-02T12:00:00Z");
  const watch = {
    ...baseRoutine,
    watch: { kind: "page", url: "https://example.com/pricing", intervalMinutes: 60 },
    status: {
      ...baseRoutine.status,
      lastCheckedAt: "2026-02-02T11:56:00Z",
      lastChangedAt: "2026-02-01T12:00:00Z",
    },
  } as Routine;
  expect(routineTriggerSummary(watch)).toBe("Watches example.com");
  expect(routineStatusLine(watch, "en", now)).toBe("Checked 4m ago · Changed 1d ago");
  const paused = { ...watch, status: { ...watch.status, pausedReason: "noisy" } } as Routine;
  expect(routineStatusLine(paused, "en", now)).toBe("Paused: the page changes too often");
  const checkIn = { ...baseRoutine, managedKind: "check_in", crons: ["0 9 * * *"] } as Routine;
  expect(routineTriggerSummary(checkIn)).toBe("Daily check-in");
  expect(routineTriggerSummary({ ...checkIn, crons: ["0 */4 * * *"] })).toBe(
    "Check-in every 4 hours",
  );
  const schedule = {
    ...baseRoutine,
    crons: ["0 8 * * *"],
    status: {
      ...baseRoutine.status,
      lastRunAt: "2026-02-02T08:00:00Z",
      nextRunAt: "2026-02-03T08:00:00Z",
    },
  } as Routine;
  expect(routineStatusLine(schedule, "en", now)).toBe("Last ran 8:00 AM · Next Tue 8:00 AM");
  expect(routineStatusLine(baseRoutine, "en", now)).toBeNull();
});

it("describes a connected-app watch by its app, not a page", () => {
  const appWatch = {
    ...baseRoutine,
    watch: {
      kind: "connector",
      connectorId: "mcp",
      toolName: "mcp__bank__get_accounts",
      arguments: {},
      appName: "Bank",
      intervalMinutes: 60,
    },
    status: { ...baseRoutine.status, pausedReason: "errors" },
  } as Routine;
  expect(routineTriggerSummary(appWatch)).toBe("Watches Bank");
  expect(routineStatusLine(appWatch)).toBe("Paused: the app could not be checked");
});
