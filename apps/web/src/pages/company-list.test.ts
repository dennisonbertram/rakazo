import type { CompanyEntityRecord } from "@rakazo/contracts";
import { expect, it } from "vitest";
import type { CompanyRow } from "./company-list";
import { companyRows, companySources } from "./company-list";

const row = (
  name: string,
  source: string,
  role: string | null,
  since: string | null,
): CompanyRow => ({
  entity: {
    displayName: name,
    evidence: [{ sourceKind: source }],
  } as unknown as CompanyEntityRecord,
  role,
  since,
});
const rows = [
  row("Bea", "slack", "Designer", "2023-01-01"),
  row("Al", "gmail", "Engineer", null),
  row("Cy", "gmail", null, "2022-05-01"),
];
const names = (list: CompanyRow[]) => list.map((r) => r.entity.displayName);

it("searches name and role and filters source", () => {
  const asc = { field: "name", dir: "asc" } as const;
  expect(names(companyRows(rows, { q: "eng" }, asc))).toEqual(["Al"]);
  expect(names(companyRows(rows, { q: "c" }, asc))).toEqual(["Cy"]);
  expect(names(companyRows(rows, { source: "gmail" }, asc))).toEqual(["Al", "Cy"]);
  expect(companySources(rows.map((r) => r.entity))).toEqual(["gmail", "slack"]);
});

it("sorts by name, role and since with missing values last", () => {
  expect(names(companyRows(rows, {}, { field: "name", dir: "desc" }))).toEqual(["Cy", "Bea", "Al"]);
  expect(names(companyRows(rows, {}, { field: "role", dir: "asc" }))).toEqual(["Bea", "Al", "Cy"]);
  expect(names(companyRows(rows, {}, { field: "since", dir: "desc" }))).toEqual([
    "Bea",
    "Cy",
    "Al",
  ]);
});
