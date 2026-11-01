// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({ t: text, plural: () => "" }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: text, i18n: { locale: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
const rpcMock = vi.hoisted(() => ({
  company: { page: vi.fn(), review: vi.fn() },
  finance: { overview: vi.fn() },
  investors: { capTable: vi.fn() },
}));
vi.mock("../lib/rpc", () => ({ rpc: rpcMock }));

import { CompanyPage } from "./Company";
import { companyFixture } from "./company-fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const show = async (
  view: string,
  entities = companyFixture.entities,
  extra: Partial<typeof companyFixture> = {},
  reviewItems: unknown[] = [],
) => {
  rpcMock.company.page.mockResolvedValue({ ...companyFixture, entities, ...extra });
  rpcMock.company.review.mockResolvedValue({ items: reviewItems });
  rpcMock.finance.overview.mockResolvedValue(null);
  rpcMock.investors.capTable.mockResolvedValue({ snapshot: null, syncing: false });
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/app/company?view=${view}`]}>
        <CompanyPage />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

it("says there are no people instead of showing bare column headers", async () => {
  await show("people", []);
  expect(container.textContent).toContain("No people yet");
  expect(container.querySelector("table")).toBeNull();
});

it("says there are no organisations", async () => {
  await show("organisations", []);
  expect(container.textContent).toContain("No organisations yet");
});

it("still lists people when there are some", async () => {
  await show("people");
  expect(container.textContent).not.toContain("No people yet");
  expect(container.querySelector("table")).not.toBeNull();
});

it("keeps the title in the shared page header", async () => {
  await show("overview");
  expect(container.querySelector("[data-page-header] h1")?.textContent).toBe("Company");
});

it("offers Import from the empty overview", async () => {
  await show("overview", [], { events: [], latestRun: null });
  expect(container.textContent).toContain("No company facts yet");
  const links = [...container.querySelectorAll("a")].filter(
    (a) => a.getAttribute("href") === "/app/company/import" && a.textContent === "Import",
  );
  // One in the page header, one in the empty state.
  expect(links).toHaveLength(2);
});

it("shows no Import action in the empty state while an import runs", async () => {
  await show("overview", [], { events: [], latestRun: { id: "run", status: "running" } as never });
  expect(container.textContent).toContain("Import in progress");
  expect(
    [...container.querySelectorAll("a")].filter(
      (a) => a.getAttribute("href") === "/app/company/import" && a.textContent === "Import",
    ),
  ).toHaveLength(1);
});

it("links a failed import to its run", async () => {
  await show("overview", companyFixture.entities, {
    latestRun: { id: "r1", status: "failed" } as never,
  });
  const link = container.querySelector('a[role="status"]');
  expect(link?.textContent).toBe("Import failed");
  expect(link?.getAttribute("href")).toBe("/app/company/import?runId=r1");
  expect(container.textContent).not.toContain("Partial import");
});

it("shows no status line for a cancelled import", async () => {
  await show("overview", companyFixture.entities, {
    latestRun: { id: "r1", status: "cancelled" } as never,
  });
  expect(container.querySelector('[role="status"]')).toBeNull();
});

it("names the person on a Review edge card", async () => {
  const edge = companyFixture.edges[0]!;
  await show("review", companyFixture.entities, {}, [
    {
      kind: "fact",
      id: "edge:employment",
      reason: "contradiction",
      fact: { kind: "edge", record: edge },
    },
  ]);
  expect(container.textContent).toContain("Alex Reed · Engineer");
});
