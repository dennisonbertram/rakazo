// @vitest-environment jsdom
import type { Contact } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RowEdits } from "../../lib/pipeline-rows";
import { PipelineTable } from "./PipelineTable";
import { manyProspects, SAMPLE_PROSPECTS } from "./pipeline-fixtures";

vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let el: HTMLDivElement;
let phone = false;
beforeEach(() => {
  phone = false;
  vi.stubGlobal("matchMedia", () => ({
    matches: phone,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  el = document.createElement("div");
  document.body.append(el);
});
afterEach(() => {
  el.remove();
  vi.unstubAllGlobals();
});

const noop = () => {};
const edits: RowEdits = {
  status: noop,
  interest: noop,
  nextStep: noop,
  nextCall: noop,
  amount: noop,
  referrer: noop,
  createReferrer: noop,
  log: noop,
};
let search = "";
function Where() {
  search = useLocation().search;
  return null;
}
const render = (prospects: Contact[], url = "/") =>
  act(async () =>
    createRoot(el).render(
      <MemoryRouter initialEntries={[url]}>
        <Where />
        <PipelineTable
          prospects={prospects}
          contacts={[]}
          edits={edits}
          onSendSafe={noop}
          onOpenMercury={noop}
          onNotSent={noop}
          onEdit={noop}
        />
      </MemoryRouter>,
    ),
  );
const names = () =>
  [...el.querySelectorAll("[data-testid=pipeline-table] [data-row-open]")].map(
    (n) => n.textContent,
  );
const click = (node: Element | null | undefined) => act(async () => (node as HTMLElement)?.click());
const button = (label: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

it("reads its filters from the link, and Clear filters on No matches empties them", async () => {
  await render(SAMPLE_PROSPECTS, "/?interest=in");
  expect(names()).toEqual(["Placeholder Partners", "Mock Valley Seed", "Oak Example Angels"]);
  await render(SAMPLE_PROSPECTS, "/?status=diligence");
  expect(el.textContent).toContain("No matches");
  await click(button("Clear filters"));
  expect(search).toBe("");
  expect(names().length).toBeGreaterThan(0);
});

it("Due now lists overdue and today together, oldest first, and shows its count", async () => {
  await render(SAMPLE_PROSPECTS);
  expect(button("Due now · 3")).toBeDefined();
  await click(button("Due now · 3"));
  expect(search).toBe("?due=1");
  expect(names()).toEqual([
    "Sample Street Capital",
    "Example Peak Ventures",
    "Placeholder Partners",
  ]);
});

it("Filter counts the active filters and keeps Due now outside them", async () => {
  await render(SAMPLE_PROSPECTS, "/?interest=in&due=1");
  expect(button("Filter · 1")).toBeDefined();
});

it("shows a word beside an overdue date and a dash for blanks", async () => {
  await render(SAMPLE_PROSPECTS);
  const first = el.querySelector("[data-testid=pipeline-table] tbody tr");
  expect(first?.textContent).toContain("Overdue");
  expect(el.querySelector("[data-testid=pipeline-table]")?.textContent).toContain("—");
});

it("caps a long list at ten rows on desktop with See all", async () => {
  await render(manyProspects(30));
  expect(names().length).toBe(10);
  await click(button("See all (30)"));
  expect(names().length).toBe(30);
});

it("caps the phone list at six rows", async () => {
  phone = true;
  await render(manyProspects(30));
  expect(el.querySelectorAll("[data-testid=pipeline-list] li").length).toBe(6);
});

it("opens the row sheet with Log call as its primary action, and Send SAFE on a Committed row", async () => {
  await render(SAMPLE_PROSPECTS);
  await click(el.querySelector("[data-testid=row-p5] [data-row-open]"));
  const labels = [...document.querySelectorAll("[role=dialog] button")].map((b) =>
    b.textContent?.trim(),
  );
  expect(labels.at(-1)).toBe("Log call");
  expect(labels).toContain("Send SAFE");
});
