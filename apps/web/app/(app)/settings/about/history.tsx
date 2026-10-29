"use client";

import type { UpdateEntry } from "@metobe/core/update-history";
import { Button } from "@metobe/ui/components/button";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Database, Download, RotateCcw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Rows, Section } from "@/components/settings/rows";

import { useTook } from "./about-card";
import { startRollback } from "./actions";

// The updates of this server (D35), newest first: from what to what, when, by whom, how long, and the size of the
// copy of the base made before each. The updater keeps the last three copies, so only the newest three show one.

const KEPT = 3;

export const History = ({
  current,
  entries,
  updater,
}: {
  current: string;
  entries: UpdateEntry[];
  updater: string | null;
}) => {
  const t = useTranslations("about.history");
  const format = useFormatter();
  const took = useTook();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refused, setRefused] = useState(false);
  if (entries.length === 0) {
    return null;
  }
  const kept = new Set(
    entries
      .filter((e) => e.backupFile !== null)
      .slice(0, KEPT)
      .map((e) => e.id)
  );
  const rollbackId =
    updater &&
    entries.find(
      (entry) =>
        entry.operation === "install" &&
        entry.status === "done" &&
        entry.to === current &&
        entry.backupFile !== null
    )?.id;
  const triggerName = (entry: UpdateEntry) =>
    entry.by ??
    {
      manual: t("manual"),
      nightly: t("nightly"),
      patch: t("patches"),
      rollback: t("rolledBack"),
    }[entry.trigger];

  const rollback = (id: string) =>
    start(async () => {
      setRefused(false);
      if (await startRollback(id)) {
        router.refresh();
      } else {
        setRefused(true);
      }
    });

  return (
    <Section meta={t("meta")} title={t("title")}>
      <Rows>
        {entries.map((e) => (
          <div
            className="flex flex-wrap items-center gap-3 px-4 py-3"
            key={e.id}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium tabular-nums">
                {e.from} → {e.to}
                {e.operation === "rollback" && (
                  <Badge className="ml-2" size="sm" variant="outline">
                    {t("rolledBack")}
                  </Badge>
                )}
                {e.status === "failed" && (
                  <Badge className="ml-2" size="sm" variant="destructive-light">
                    {t("failed")}
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {[
                  format.dateTime(new Date(e.finishedAt), {
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                  }),
                  triggerName(e),
                  took(
                    (Date.parse(e.finishedAt) - Date.parse(e.startedAt)) / 1000
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {e.backupFile && e.backupSize !== null && kept.has(e.id) && (
              <Button
                nativeButton={false}
                render={
                  <a
                    aria-label={t("download", { version: e.from })}
                    download
                    href={`/api/update/backups/${encodeURIComponent(e.backupFile)}`}
                  />
                }
                size="sm"
                variant="outline"
              >
                <Database className="size-3.5" />
                {format.number(e.backupSize / 1e6, {
                  maximumFractionDigits: e.backupSize < 1e7 ? 1 : 0,
                  style: "unit",
                  unit: "megabyte",
                })}
                <Download className="size-3.5" />
              </Button>
            )}
            {e.id === rollbackId && (
              <Button
                disabled={pending}
                onClick={() => rollback(e.id)}
                size="sm"
                variant="outline"
              >
                <RotateCcw className="size-3.5" />
                {pending ? t("rollingBack") : t("rollbackButton")}
              </Button>
            )}
          </div>
        ))}
      </Rows>
      {refused && (
        <p className="text-destructive text-xs" role="alert">
          {t("rollbackRefused")}
        </p>
      )}
    </Section>
  );
};
