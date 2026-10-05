"use client";

import type { FileKind } from "@metobe/contracts/files";
import type { StorageProbe } from "@metobe/core/storage";
import { Button } from "@metobe/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metobe/ui/components/empty";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { cn } from "@metobe/ui/lib/utils";
import { HardDrive, RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { probe } from "./actions";

// The files' storage (D4, D33): where it is, whether it answers and takes a file, and what the files take. Read-only:
// the keys live in `.env` and are never shown; changing the storage is changing `.env` (or running install.sh again).

interface Info {
  bucket: string;
  bundled: boolean;
  host: string;
  pathStyle: boolean;
  region: string;
}

interface Usage {
  bytes: number;
  count: number;
  kinds: { kind: string; count: number; bytes: number }[];
}

const KB = 1024;

/** 1536 → «1,5 КБ»: the unit that keeps the number short. */
const useSize = () => {
  const f = useFormatter();
  const t = useTranslations("storage.units");
  return (bytes: number) => {
    const units = ["b", "kb", "mb", "gb"] as const;
    let value = bytes;
    let unit = 0;
    while (value >= KB && unit < units.length - 1) {
      value /= KB;
      unit += 1;
    }
    const shown = f.number(value, {
      maximumFractionDigits: unit === 0 ? 0 : 1,
    });
    return `${shown} ${t(units[unit] ?? "b")}`;
  };
};

type Found = StorageProbe | null | "running";

/** What the last probe (or the page's quick look) found, in words, with a dot. */
const State = ({ found, state }: { found: Found; state: "ok" | "down" }) => {
  const t = useTranslations("storage.check");
  const f = useFormatter();
  if (found === "running") {
    return (
      <span className="flex items-center gap-2">
        <span className="bg-warning size-2 animate-pulse rounded-full" />
        {t("running")}
      </span>
    );
  }
  if (found && !found.ok) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="bg-destructive size-2 shrink-0 rounded-full" />
        <span className="truncate" title={found.detail}>
          {t(`problems.${found.problem}`, { step: t(`steps.${found.step}`) })}
        </span>
      </span>
    );
  }
  if (found?.ok) {
    return (
      <span className="flex items-center gap-2">
        <span className="bg-success size-2 rounded-full" />
        {t("ok", { ms: f.number(found.ms) })}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "size-2 rounded-full",
          state === "ok" ? "bg-success" : "bg-destructive"
        )}
      />
      {t(state === "ok" ? "answers" : "down")}
    </span>
  );
};

export const StorageSettings = ({
  info,
  state,
  usage,
}: {
  info: Info | null;
  state: "ok" | "down" | "off";
  usage: Usage;
}) => {
  const t = useTranslations("storage");
  const size = useSize();
  const [found, setFound] = useState<Found>(null);
  const [pending, start] = useTransition();

  if (!info || state === "off") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <HardDrive />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("off.title")}</EmptyTitle>
          <EmptyDescription>{t("off.text")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Section
        action={
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setFound("running");
                setFound(await probe());
              })
            }
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn(pending && "animate-spin")} />
            {t("check.button")}
          </Button>
        }
        title={t("where.title")}
      >
        <Rows>
          <Row label={t("where.label")}>
            <span className="font-mono text-sm">
              {info.bundled ? t("where.bundled") : info.host}
            </span>
          </Row>
          <Row label={t("bucket")}>
            <span className="font-mono text-sm">{info.bucket}</span>
          </Row>
          <Row hint={t("check.hint")} label={t("check.label")}>
            <State found={found} state={state === "ok" ? "ok" : "down"} />
          </Row>
        </Rows>
        <p className="text-muted-foreground text-xs">{t("keys")}</p>
      </Section>

      <Section title={t("usage.title")}>
        {usage.count === 0 ? (
          <p className="text-muted-foreground text-sm">{t("usage.empty")}</p>
        ) : (
          <Rows>
            <Row label={t("usage.all")}>
              <span className="tabular-nums">
                {t("usage.files", { count: usage.count })} · {size(usage.bytes)}
              </span>
            </Row>
            {usage.kinds.map((k) => (
              <Row key={k.kind} label={t(`kinds.${k.kind as FileKind}`)}>
                <span className="text-muted-foreground tabular-nums">
                  {t("usage.files", { count: k.count })} · {size(k.bytes)}
                </span>
              </Row>
            ))}
          </Rows>
        )}
      </Section>
    </>
  );
};
