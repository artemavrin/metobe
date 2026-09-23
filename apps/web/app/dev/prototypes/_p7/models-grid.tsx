"use client";

import { Badge } from "@purr/ui/components/reui/badge";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@purr/ui/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@purr/ui/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@purr/ui/components/reui/data-grid/data-grid-table";
import { Switch } from "@purr/ui/components/switch";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { useMemo } from "react";

import { fmtContext, fmtPrice, type Model, type ProviderKind, providerBy } from "./mock";
import { CapIcons, ProviderMark } from "./shared";

export type ModelRow = { key: string; kind: ProviderKind; model: Model; on: boolean };

/** Models table on the ReUI DataGrid. */
export const ModelsGrid = ({
  rows,
  onToggle,
  showProvider = false,
}: {
  rows: ModelRow[];
  onToggle: (row: ModelRow, on: boolean) => void;
  showProvider?: boolean;
}) => {
  const columns = useMemo<ColumnDef<DataGridFeatures, ModelRow>[]>(
    () => [
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
          <div className={row.original.on ? "" : "opacity-60"}>
            <div className="flex items-center gap-1.5 font-medium">
              {row.original.model.title}
              {row.original.model.recommended && (
                <Badge size="xs" variant="primary-light">
                  рек.
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
        cell: ({ row }) => <span className="tabular-nums">{fmtPrice(row.original.model)}</span>,
        header: "За 1M, вход / выход",
        id: "price",
        size: 170,
      },
    ],
    [onToggle, showProvider]
  );

  const table = useTable({
    columns,
    data: rows,
    features: dataGridFeatures,
    getRowId: (row: ModelRow) => row.key,
  });

  return (
    <DataGrid emptyMessage="Ничего не нашлось" recordCount={rows.length} table={table} tableLayout={{ dense: true, headerBackground: true }}>
      <DataGridScrollArea>
        <DataGridTable />
      </DataGridScrollArea>
    </DataGrid>
  );
};
