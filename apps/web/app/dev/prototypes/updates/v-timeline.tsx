"use client";

import { Button } from "@metobe/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@metobe/ui/components/collapsible";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Database } from "lucide-react";
import { useState } from "react";

import { BACKUPS, CURRENT, HISTORY, NEXT } from "./data";
import { Actions, Automatic, Changelog, day, dayTime, Manual, Outcome, Page, Progress, Scheduled, StatusBadge, WhatHappens } from "./parts";
import { useProto } from "./state";
import { UserView } from "./user-view";

// «Лента» — the server's versions as one line, newest on top: the new release (with its notes, buttons, then the
// steps right there), the one running now, the ones before with their copies of the base. Where the server has been
// and where it goes, in one look.

const Node = ({ dot, children, last }: { dot: "next" | "now" | "past"; children: React.ReactNode; last?: boolean }) => (
  <li className="relative flex gap-4 pb-8 last:pb-0">
    {!last && <span aria-hidden className="bg-border absolute top-4 bottom-0 left-[7px] w-px" />}
    <span
      aria-hidden
      className={cn(
        "relative z-10 mt-1 size-[15px] shrink-0 rounded-full border-2",
        dot === "next" && "border-primary bg-background",
        dot === "now" && "border-primary bg-primary",
        dot === "past" && "border-border bg-muted"
      )}
    />
    <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
  </li>
);

const Next = () => {
  const { phase } = useProto();
  const [open, setOpen] = useState(true);
  if (phase === "latest") {
    return (
      <Node dot="next">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">Новых версий нет · проверили 20 минут назад</span>
          <Button size="sm" variant="outline">
            Проверить
          </Button>
        </div>
      </Node>
    );
  }
  return (
    <Node dot="next">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-base font-semibold">{NEXT.version}</h3>
        <StatusBadge />
        <span className="text-muted-foreground text-sm">
          {day(NEXT.date)} · {NEXT.size}
        </span>
      </div>
      {phase === "updating" || phase === "done" || phase === "failed" ? (
        <>
          <Outcome />
          <Progress />
        </>
      ) : (
        <>
          <Collapsible onOpenChange={setOpen} open={open}>
            <CollapsibleTrigger render={<Button className="-ml-2" size="sm" variant="ghost" />}>
              Что нового
              <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Changelog />
            </CollapsibleContent>
          </Collapsible>
          {phase === "manual" ? (
            <Manual />
          ) : phase === "scheduled" ? (
            <Scheduled />
          ) : (
            <>
              <WhatHappens />
              <Actions />
            </>
          )}
        </>
      )}
    </Node>
  );
};

export const Timeline = () => {
  const { eye, phase } = useProto();
  if (eye === "user") return <UserView />;
  const past = HISTORY.filter((h) => h.from);
  return (
    <Page>
      <ol className="flex flex-col">
        {phase !== "done" && <Next />}
        <Node dot="now">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-base font-semibold">{phase === "done" ? NEXT.version : CURRENT.version}</h3>
            <span className="text-muted-foreground text-sm">
              сейчас · {phase === "done" ? "с сегодняшнего дня" : `с ${day(CURRENT.installed)}`}
            </span>
          </div>
          {phase === "done" && <Outcome />}
        </Node>
        {[...(phase === "done" ? [{ at: "2026-10-29T14:20", by: "Артём Маврин", from: CURRENT.version, took: "1 мин 12 с", to: NEXT.version }] : []), ...past].map((h, i, all) => {
          const copy = [...(phase === "done" ? [{ at: "2026-10-29T14:20", size: "48 МБ", version: CURRENT.version }] : []), ...BACKUPS].find((b) => b.at === h.at);
          return (
            <Node dot="past" key={h.at} last={i === all.length - 1}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-sm font-medium">{h.from}</span>
                  <span className="text-muted-foreground text-xs">
                    до {dayTime(h.at)} · обновил {h.by} за {h.took}
                  </span>
                </div>
                {copy && (
                  <Button size="sm" variant="ghost">
                    <Database />
                    Копия · {copy.size}
                  </Button>
                )}
              </div>
            </Node>
          );
        })}
      </ol>
      {phase !== "manual" && <Automatic />}
    </Page>
  );
};
