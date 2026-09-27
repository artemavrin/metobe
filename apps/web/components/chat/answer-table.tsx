"use client";

import { TABLE_MAX_ROWS } from "@metobe/contracts/table";
import type { TableCell, TableColumnType } from "@metobe/contracts/table";
import {
  DataGrid,
  dataGridFeatures,
} from "@metobe/ui/components/reui/data-grid/data-grid";
import type { DataGridFeatures } from "@metobe/ui/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@metobe/ui/components/reui/data-grid/data-grid-column-header";
import { DataGridScrollArea } from "@metobe/ui/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@metobe/ui/components/reui/data-grid/data-grid-table";
import { Filters } from "@metobe/ui/components/reui/filters/filters";
import { createFilterQuery } from "@metobe/ui/components/reui/filters/filters-query";
import type {
  FilterField,
  FilterLabels,
  FilterQuery,
} from "@metobe/ui/components/reui/filters/filters-types";
import { Skeleton } from "@metobe/ui/components/skeleton";
import { cn } from "@metobe/ui/lib/utils";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { GridLoader } from "gridora";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { TablePart } from "@/lib/answer-work";
import {
  categoryValues,
  firstSeen,
  matchesQuery,
  tableView,
} from "@/lib/table-data";
import type { TableColumn, TableRow } from "@/lib/table-data";

// A table the model builds in its answer (ReUI Data Grid + Filters): columns first, then rows landing one by one as
// the model writes them, a skeleton row where the next one comes. Sorted from the headers, filtered from the bar.

// A row lands: it rises 4px and fades in — only while the model writes; a table from the history just stands. A
// filter's chip grows in from the button it came from instead of popping into the header. Reduced motion keeps fades.
const TABLE_CSS = `
@keyframes table-row-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
@keyframes table-row-fade { from { opacity: 0 } to { opacity: 1 } }
.table-row-in { animation: table-row-in 220ms cubic-bezier(0.23, 1, 0.32, 1) both }
@keyframes table-chip-in { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: none } }
[data-slot="filters"] [data-slot="filter-chip"] { animation: table-chip-in 180ms cubic-bezier(0.23, 1, 0.32, 1) both; transform-origin: right center }
@media (prefers-reduced-motion: reduce) {
  .table-row-in { animation: table-row-fade 160ms ease both }
  [data-slot="filters"] [data-slot="filter-chip"] { animation: table-row-fade 160ms ease both }
}
`;

/** A category's dot: its colour by the order its value first came, so it never changes as rows land. Same dot in the cell and the filter. */
const TONES = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-fuchsia-500",
];
const OTHER_TONE = "bg-muted-foreground/50";

const Dot = ({ tone }: { tone: string }) => (
  <span
    aria-hidden="true"
    className={cn("size-1.5 shrink-0 rounded-full", tone)}
  />
);

const ALIGN_END = new Set<TableColumnType>(["number"]);

/** Sorting by the value itself: numbers as numbers, the rest as text, empty cells last either way. */
const sortValue = (v: TableCell, type: TableColumnType) => {
  if (v === null || v === "") {
    return;
  }
  if (type === "number") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return String(v);
};

/** A date-only value is a calendar day: read in UTC, it is the same day anywhere. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

const CellValue = ({
  value,
  type,
  tone,
}: {
  value: TableCell;
  type: TableColumnType;
  tone?: string;
}) => {
  const format = useFormatter();
  const t = useTranslations("chat.table");
  if (value === null || value === "") {
    return <span className="text-muted-foreground/60">{t("empty")}</span>;
  }
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return (
      <span className="tabular-nums">
        {Number.isFinite(n) ? format.number(n) : String(value)}
      </span>
    );
  }
  if (type === "date") {
    const text = String(value);
    const date = new Date(text);
    return (
      <span className="whitespace-nowrap tabular-nums">
        {Number.isNaN(date.getTime())
          ? text
          : format.dateTime(date, {
              dateStyle: "medium",
              ...(DATE_ONLY.test(text) ? { timeZone: "UTC" } : {}),
            })}
      </span>
    );
  }
  if (type === "category") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Dot tone={tone ?? OTHER_TONE} />
        {String(value)}
      </span>
    );
  }
  return (
    <span className="line-clamp-2 min-w-[12ch]" title={String(value)}>
      {String(value)}
    </span>
  );
};

/** The filters' copy in the user's language (ReUI ships English). */
const useFilterCopy = () => {
  const t = useTranslations("chat.table");
  const labels: Partial<FilterLabels> = {
    actionsLabel: t("filters.actionsLabel"),
    addFilter: t("filters.addFilter"),
    and: t("filters.and"),
    apply: t("filters.apply"),
    back: t("filters.back"),
    clear: t("filters.clear"),
    clearAll: t("filters.clearAll"),
    countAnnouncement: (count) => t("filters.countAnnouncement", { count }),
    duplicate: t("filters.duplicate"),
    empty: t("filters.empty"),
    fieldsLabel: t("filters.fieldsLabel"),
    filtersLabel: t("filters.filtersLabel"),
    incomplete: t("filters.incomplete"),
    issueOperator: t("filters.issueOperator"),
    issueRange: t("filters.issueRange"),
    issueRangeOrder: t("filters.issueRangeOrder"),
    issueValue: t("filters.issueValue"),
    itemCount: (count) => t("filters.itemCount", { count }),
    negate: t("filters.negate"),
    negated: (operator) => t("filters.negated", { operator }),
    noValue: t("filters.noValue"),
    or: t("filters.or"),
    rangeSeparator: t("filters.rangeSeparator"),
    remove: t("filters.remove"),
    resultsAnnouncement: (count) => t("filters.resultsAnnouncement", { count }),
    searchFields: t("filters.searchFields"),
    searchOperators: t("filters.searchOperators"),
    searchOptions: t("filters.searchOptions"),
    selectCondition: t("filters.selectCondition"),
    selectPlaceholder: t("filters.selectPlaceholder"),
    valueCount: (count) => t("filters.valueCount", { count }),
    valuePlaceholder: t("filters.valuePlaceholder"),
    valueRange: (from, to) => t("filters.valueRange", { from, to }),
    where: t("filters.where"),
  };
  const operators = [
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "is",
    "is_not",
    "is_any_of",
    "is_none_of",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "not_between",
    "empty",
    "not_empty",
  ] as const;
  const operatorLabels = Object.fromEntries(
    operators.map((o) => [o, t(`operators.${o}`)])
  );
  return { labels, operatorLabels };
};

/** Where the next row comes: one line of bars, as wide as the columns. */
const PendingRow = ({ columns }: { columns: TableColumn[] }) => (
  <tr aria-hidden="true">
    {columns.map((c) => (
      <td className="px-3 py-2" key={c.id}>
        <Skeleton
          className={cn(
            "h-3.5 rounded-sm",
            ALIGN_END.has(c.type) ? "ms-auto w-12" : "w-3/5"
          )}
        />
      </td>
    ))}
  </tr>
);

/** While the model writes and the rows overflow the table's height, the newest row stays in view — unless the user scrolled up. */
const useFollowRows = (count: number, streaming: boolean) => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = box.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!streaming || count === 0 || !viewport) {
      return;
    }
    // A row is ~36px: closer than two rows to the end still counts as «at the end».
    const fromEnd =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (fromEnd < 96) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [count, streaming]);
  return box;
};

export const AnswerTable = ({ part }: { part: TablePart }) => {
  const t = useTranslations("chat.table");
  const copy = useFilterCopy();
  const view = tableView(part);
  const [query, setQuery] = useState<FilterQuery>(() => createFilterQuery([]));
  const [sorting, setSorting] = useState<SortingState>([]);
  const box = useFollowRows(view.rows.length, view.streaming);

  // A category's values: most frequent first for the filter's options, in the order they came for the colours.
  const values = view.columns.map((c, i) =>
    c.type === "category" ? categoryValues(view.rows, i) : []
  );
  const order = view.columns.map((c, i) =>
    c.type === "category" ? firstSeen(view.rows, i) : []
  );
  const toneOf = (index: number, value: TableCell) => {
    const at = order[index]?.indexOf(String(value)) ?? -1;
    return at === -1 ? OTHER_TONE : (TONES[at] ?? OTHER_TONE);
  };

  const fields: FilterField[] = view.columns.map((c, i) => {
    if (c.type === "category") {
      return {
        defaultOperator: "is_any_of",
        id: c.id,
        label: c.label,
        options: (values[i] ?? []).map((v) => ({
          icon: <Dot tone={toneOf(i, v)} />,
          label: v,
          value: v,
        })),
        type: "select",
      };
    }
    // A condition from the start, so a filter is two clicks: the column, then the value.
    return c.type === "number"
      ? { defaultOperator: "gte", id: c.id, label: c.label, type: "number" }
      : { defaultOperator: "contains", id: c.id, label: c.label, type: "text" };
  });

  const columns: ColumnDef<DataGridFeatures, TableRow>[] = view.columns.map(
    (c, i) => ({
      accessorFn: (row) => sortValue(row.cells[i] ?? null, c.type),
      // oxlint-disable-next-line react/no-unstable-nested-components -- TanStack's cell renderer, not a component
      cell: ({ row }) => (
        <CellValue
          tone={
            c.type === "category"
              ? toneOf(i, row.original.cells[i] ?? null)
              : undefined
          }
          type={c.type}
          value={row.original.cells[i] ?? null}
        />
      ),
      enableSorting: true,
      // oxlint-disable-next-line react/no-unstable-nested-components -- TanStack's header renderer, not a component
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title={c.label} />
      ),
      id: c.id,
      meta: ALIGN_END.has(c.type)
        ? {
            cellClassName: "text-end",
            headerClassName: "[&>div]:justify-end",
          }
        : undefined,
      sortFn: c.type === "number" ? "basic" : "alphanumeric",
      sortUndefined: "last",
    })
  );

  const rows = view.rows.filter((r) => matchesQuery(r, query));
  const filtered = rows.length !== view.rows.length;

  const table = useTable({
    columns,
    data: rows,
    features: dataGridFeatures,
    getRowId: (row: TableRow) => row.id,
    onSortingChange: setSorting,
    // One page: the table scrolls within its height, it does not page.
    state: { pagination: { pageIndex: 0, pageSize: TABLE_MAX_ROWS }, sorting },
  });

  const ready = view.columns.length > 0;
  return (
    <section
      aria-busy={view.streaming}
      aria-label={view.title || undefined}
      className="bg-card border-foreground/10 w-full overflow-hidden rounded-xl border"
    >
      {/* A border, not a ring: the grid's rows paint over a ring's sides; `overflow-hidden` clips inside a border. */}
      <style>{TABLE_CSS}</style>
      <header className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
        <div className="me-auto flex min-w-0 items-baseline gap-2">
          {view.title ? (
            <h3 className="truncate text-sm font-medium">{view.title}</h3>
          ) : (
            view.streaming && <Skeleton className="h-3.5 w-32 rounded-sm" />
          )}
          {ready && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {filtered
                ? t("shown", { shown: rows.length, total: view.rows.length })
                : t("rows", { count: view.rows.length })}
            </span>
          )}
        </div>
        {view.streaming ? (
          <output className="text-muted-foreground flex h-7 items-center gap-2 text-xs">
            <span className="grid size-3.5 place-items-center">
              <GridLoader
                cellSize={3}
                gap={1.5}
                respectReducedMotion
                variant="cacheWarm"
              />
            </span>
            <span className="shimmer">{t("building")}</span>
          </output>
        ) : (
          ready &&
          view.rows.length > 1 && (
            <Filters
              fields={fields}
              labels={copy.labels}
              onQueryChange={setQuery}
              operatorLabels={copy.operatorLabels}
              query={query}
              showClear
              size="sm"
            />
          )
        )}
      </header>
      {ready ? (
        <div ref={box}>
          <DataGrid
            appendRow={
              view.streaming ? <PendingRow columns={view.columns} /> : undefined
            }
            emptyMessage={filtered ? t("noMatch") : t("noRows")}
            i18n={{
              labels: {
                sortAscending: t("sortAscending"),
                sortDescending: t("sortDescending"),
              },
            }}
            recordCount={rows.length}
            table={table}
            tableClassNames={{
              bodyRow: view.streaming ? "table-row-in" : undefined,
            }}
            tableLayout={{
              dense: true,
              headerBackground: true,
              headerSticky: true,
              width: "auto",
            }}
          >
            {/* The height caps the viewport, not the root: the viewport is `size-full`, and a percentage of a
                max-height is no height at all — the rows were cut off and nothing scrolled. */}
            <DataGridScrollArea className="[&_[data-slot=scroll-area-viewport]]:max-h-[26rem]">
              <DataGridTable />
            </DataGridScrollArea>
          </DataGrid>
        </div>
      ) : (
        view.streaming && (
          <div aria-hidden="true" className="flex flex-col gap-2.5 p-3">
            <Skeleton className="h-3.5 w-full rounded-sm" />
            <Skeleton className="h-3.5 w-4/5 rounded-sm" />
            <Skeleton className="h-3.5 w-3/5 rounded-sm" />
          </div>
        )
      )}
    </section>
  );
};
