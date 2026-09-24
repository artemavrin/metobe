"use client";

import { Badge } from "@purr/ui/components/reui/badge";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@purr/ui/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@purr/ui/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable, DataGridTableRowSelect, DataGridTableRowSelectAll } from "@purr/ui/components/reui/data-grid/data-grid-table";
import { Switch } from "@purr/ui/components/switch";
import { type ColumnDef, type RowSelectionState, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { cn } from "@purr/ui/lib/utils";

import { fmtContext, fmtPrice, isNew, type Model, type ProviderKind, providerBy } from "./mock";
import { CapIcons, ProviderMark } from "./shared";

export type ModelRow = { key: string; kind: ProviderKind; model: Model; on: boolean };

const rowId = (r: ModelRow) => `${r.key}|${r.on ? 1 : 0}|${fmtPrice(r.model)}|${JSON.stringify(r.model.caps)}`;
/** Selection state is keyed by row id; this maps it back to model keys. */
export const selectedKeys = (s: Record<string, boolean>) =>
  Object.keys(s)
    .filter((k) => s[k])
    .map((k) => k.split("|")[0] as string);

type Props = Parameters<typeof ModelsGridInner>[0];

/**
 * Models table on the ReUI DataGrid.
 * Prototype workaround: in our setup (TanStack Table v9 + ReUI DataGrid) the grid does not pick up a new `data`
 * with the same row ids — cells stay stale. Re-keying on the rows' fingerprint remounts it. To investigate in M2.
 */
export const ModelsGrid = (props: Props) => <ModelsGridInner key={props.rows.map(rowId).join()} {...props} />;

const ModelsGridInner = ({
  rows,
  onToggle,
  showProvider = false,
  onRowClick,
  activeKey,
  selection,
  onSelectionChange,
  priceCell,
}: {
  rows: ModelRow[];
  onToggle: (row: ModelRow, on: boolean) => void;
  showProvider?: boolean;
  /** Opens a model (the inspector riff); `activeKey` marks the open one. */
  onRowClick?: (row: ModelRow) => void;
  activeKey?: string;
  /** Checkbox column for bulk actions (the compact riff). */
  selection?: RowSelectionState;
  onSelectionChange?: (s: RowSelectionState) => void;
  /** Replaces the price cell, e.g. with an inline editor. */
  priceCell?: (row: ModelRow) => React.ReactNode;
}) => {
  const columns = useMemo<ColumnDef<DataGridFeatures, ModelRow>[]>(
    () => [
      ...(selection
        ? [
            {
              cell: ({ row }) => <DataGridTableRowSelect row={row} />,
              header: () => <DataGridTableRowSelectAll />,
              id: "select",
              size: 40,
            } satisfies ColumnDef<DataGridFeatures, ModelRow>,
          ]
        : []),
      {
        cell: ({ row }) => (
          <Switch
            aria-label={`Включить ${row.original.model.title}`}
            checked={row.original.on}
            onCheckedChange={(v) => onToggle(row.original, v)}
            size="sm"
          />
        ),
        header: "",
        id: "on",
        size: 56,
      },
      {
        cell: ({ row }) => (
          <div className={cn(!row.original.on && "opacity-60", activeKey === row.original.key && "border-primary -ml-3 border-l-2 pl-2.5")}>
            <div className="flex items-center gap-1.5 font-medium">
              {row.original.model.title}
              {isNew(row.original.model) && (
                <Badge size="xs" variant="info-light">
                  новая
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground font-mono text-[11px]">{row.original.model.id}</div>
          </div>
        ),
        header: "Модель",
        id: "model",
        meta: { autoSize: true },
        minSize: 220,
      },
      ...(showProvider
        ? [
            {
              cell: ({ row }) => (
                <span className="flex items-center gap-2">
                  <ProviderMark kind={row.original.kind} size="xs" />
                  {providerBy(row.original.kind).title}
                </span>
              ),
              header: "Провайдер",
              id: "provider",
              size: 190,
            } satisfies ColumnDef<DataGridFeatures, ModelRow>,
          ]
        : []),
      {
        cell: ({ row }) => row.original.model.vendor,
        header: "Вендор",
        id: "vendor",
        size: 120,
      },
      {
        cell: ({ row }) => <span className="tabular-nums">{fmtContext(row.original.model.context)}</span>,
        header: "Контекст",
        id: "context",
        size: 100,
      },
      {
        cell: ({ row }) => <CapIcons caps={row.original.model.caps} />,
        header: "Возможности",
        id: "caps",
        size: 140,
      },
      {
        cell: ({ row }) => (priceCell ? priceCell(row.original) : <span className="tabular-nums">{fmtPrice(row.original.model)}</span>),
        header: "За 1M, вход / выход",
        id: "price",
        size: 170,
      },
    ],
    [onToggle, showProvider, activeKey, selection, priceCell]
  );

  const table = useTable({
    columns,
    data: rows,
    features: dataGridFeatures,
    getRowId: rowId,
    ...(selection
      ? {
          enableRowSelection: true,
          onRowSelectionChange: (u: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) =>
            onSelectionChange?.(typeof u === "function" ? u(selection) : u),
          state: { rowSelection: selection },
        }
      : {}),
  });

  return (
    <DataGrid
      emptyMessage="Ничего не нашлось"
      onRowClick={onRowClick}
      recordCount={rows.length}
      table={table}
      tableLayout={{ dense: true, headerBackground: true }}
    >
      <DataGridScrollArea>
        <DataGridTable />
      </DataGridScrollArea>
    </DataGrid>
  );
};
