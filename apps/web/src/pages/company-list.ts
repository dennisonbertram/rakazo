import type { CompanyEntityRecord } from "@rakazo/contracts";
import type { SortDir } from "../lib/list-params";
import { sortBy } from "../lib/list-params";

export const COMPANY_SORTS = ["name", "role", "since"] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number];
export const DEFAULT_COMPANY_SORT = { field: "name", dir: "asc" } as const;

export type CompanyFilters = { q?: string; source?: string };

/** A person's or organisation's row: the entity with the role and start date shown beside it. */
export type CompanyRow = {
  entity: CompanyEntityRecord;
  role: string | null;
  since: string | null;
};

/** The kinds of source that back any of these rows, for the Source filter. */
export const companySources = (entities: CompanyEntityRecord[]): string[] =>
  [...new Set(entities.flatMap((e) => e.evidence.map((ev) => ev.sourceKind)))].sort();

/** Rows whose name or role contains the search text and that have evidence from the chosen source. */
export function filterCompanyRows(rows: CompanyRow[], { q, source }: CompanyFilters): CompanyRow[] {
  const needle = q?.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!needle ||
        [row.entity.displayName, row.role ?? ""].some((text) =>
          text.toLowerCase().includes(needle),
        )) &&
      (!source || row.entity.evidence.some((ev) => ev.sourceKind === source)),
  );
}

export function companyRows(
  rows: CompanyRow[],
  filters: CompanyFilters,
  sort: { field: CompanySort; dir: SortDir },
): CompanyRow[] {
  return sortBy(
    filterCompanyRows(rows, filters),
    (row) => (sort.field === "name" ? row.entity.displayName : row[sort.field]),
    sort.dir,
  );
}
