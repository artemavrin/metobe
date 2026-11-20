"use client";

import type { SandboxStatus } from "@metobe/contracts/sandbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metobe/ui/components/empty";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { cn } from "@metobe/ui/lib/utils";
import { SquareTerminal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Row, Rows, Section } from "@/components/settings/rows";

// The sandbox (D47): whether it is up, how it is isolated, its limits and the boxes now. Read-only: the limits are
// in `.env`, the service is turned on by the installer.

const Dot = ({ ok }: { ok: boolean }) => (
  <span
    className={cn(
      "size-2 shrink-0 rounded-full",
      ok ? "bg-success" : "bg-destructive"
    )}
  />
);

const Boxes = ({
  status,
  names,
}: {
  status: SandboxStatus;
  names: Record<string, string>;
}) => {
  const t = useTranslations("sandbox.boxes");
  const f = useFormatter();
  if (status.boxes.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {status.boxes.map((b) => (
        <li
          className="flex items-center justify-between gap-3 px-4 py-3"
          key={`${b.key}:${b.createdAt}`}
        >
          <span className="flex min-w-0 items-center gap-2.5 font-medium">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                b.busy ? "bg-warning animate-pulse" : "bg-muted-foreground/40"
              )}
            />
            <span className="truncate">{names[b.userId] ?? t("unknown")}</span>
            {b.class === "task" && (
              <span className="text-muted-foreground text-xs">{t("task")}</span>
            )}
          </span>
          <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
            {b.busy || !b.idleUntil
              ? t("busy")
              : t("idle", {
                  time: f.dateTime(new Date(b.idleUntil), {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
          </span>
        </li>
      ))}
    </ul>
  );
};

export const SandboxSettings = ({
  installed,
  status,
  names,
}: {
  installed: boolean;
  status: SandboxStatus | null;
  names: Record<string, string>;
}) => {
  const t = useTranslations("sandbox");
  if (!installed) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <SquareTerminal />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("off.title")}</EmptyTitle>
          <EmptyDescription>{t("off.text")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const gvisor = status?.runtime === "runsc";
  let state = t("state.down");
  if (status?.ready) {
    state = t("state.ready");
  } else if (status?.problem) {
    state = t(`state.problems.${status.problem}`);
  }
  return (
    <>
      <Section title={t("state.title")}>
        <Rows>
          <Row label={t("state.label")}>
            <span className="flex items-center gap-2">
              <Dot ok={status?.ready === true} />
              {state}
            </span>
          </Row>
          {status && (
            <Row
              hint={gvisor ? undefined : t("runtime.runcHint")}
              label={t("runtime.label")}
            >
              <span className="flex items-center gap-2">
                <Dot ok={gvisor} />
                {gvisor ? t("runtime.gvisor") : t("runtime.runc")}
              </span>
            </Row>
          )}
          {status && (
            <Row label={t("image")}>
              <span className="font-mono text-sm break-all">
                {status.image}
              </span>
            </Row>
          )}
        </Rows>
      </Section>

      {status && (
        <Section title={t("limits.title")}>
          <Rows>
            <Row label={t("limits.total")}>{status.limits.total}</Row>
            <Row label={t("limits.perUser")}>{status.limits.perUser}</Row>
            <Row label={t("limits.idle")}>
              {t("limits.idleValue", {
                minutes: Math.round(status.limits.idleSeconds / 60),
              })}
            </Row>
            <Row label={t("limits.memory")}>
              {t("limits.memoryValue", { mb: status.limits.memoryMb })}
            </Row>
          </Rows>
          <p className="text-muted-foreground text-xs">{t("limits.note")}</p>
        </Section>
      )}

      {status && (
        <Section
          meta={
            status.waiting > 0 && t("boxes.waiting", { count: status.waiting })
          }
          title={t("boxes.title")}
        >
          <Boxes names={names} status={status} />
        </Section>
      )}
    </>
  );
};
