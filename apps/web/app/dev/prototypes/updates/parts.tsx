"use client";

import { Button } from "@metobe/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUpRight, Check, ChevronDown, Copy, Database, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { BACKUPS, CURRENT, FAILURE, HISTORY, MANUAL, NEXT, STEPS } from "./data";
import { useProto } from "./state";

// What the variants share: the page, the release's notes, the steps of a running update, the automatic updates,
// the history with its copies of the base, the command for a server without the updater, and the chat as a person
// sees it meanwhile.

const DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const DAY_TIME = new Intl.DateTimeFormat("ru-RU", { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short" });
export const day = (d: string) => DAY.format(new Date(`${d}T12:00:00`));
export const dayTime = (d: string) => DAY_TIME.format(new Date(d)).replace(".", "");

export const took = (s: number) => (s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${String(s % 60).padStart(2, "0")} с`);

/** The settings page's width and header. */
export const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="@container mx-auto w-full max-w-4xl">
    <div className="flex flex-col gap-6 px-4 pt-4 pb-32 md:gap-8 md:px-10 md:pt-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">О системе</h1>
        <p className="text-muted-foreground">Версия Metobe, обновления и копии базы.</p>
      </header>
      {children}
    </div>
  </div>
);

/** The release's notes as GitHub has them: what is new, what is fixed; three of each, the rest on a click. */
export const Changelog = ({ dense }: { dense?: boolean }) => {
  const [all, setAll] = useState(false);
  const list = (title: string, items: string[]) => (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-muted-foreground text-xs font-medium">
        {title} · {items.length}
      </h4>
      <ul className="flex flex-col gap-1.5">
        {(all ? items : items.slice(0, 3)).map((it) => (
          <li className="flex gap-2 text-sm leading-snug" key={it}>
            <span aria-hidden className="bg-muted-foreground/50 mt-[0.45rem] size-1 shrink-0 rounded-full" />
            <span className="first-letter:uppercase">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className={cn("flex flex-col gap-4", dense && "gap-3")}>
      <div className={cn("grid gap-4", !dense && "@2xl:grid-cols-2")}>
        {list("Новое", NEXT.features)}
        {list("Исправления", NEXT.fixes)}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button className="-ml-2" onClick={() => setAll(!all)} size="sm" variant="ghost">
          {all ? "Свернуть" : `Ещё ${NEXT.features.length + NEXT.fixes.length - 6}`}
          <ChevronDown className={cn("transition-transform", all && "rotate-180")} />
        </Button>
        <a className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm" href={NEXT.url} rel="noreferrer" target="_blank">
          На GitHub
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
};

/** What will happen, said before the button: the copy, the pause, the restart. */
export const WhatHappens = () => (
  <p className="text-muted-foreground text-sm">
    Сначала скачаем новую версию и сделаем копию базы — в версии {NEXT.migrations} изменения базы. Потом дадим ответам
    дописаться и перезапустим: Metobe будет недоступен секунд десять. Если что-то пойдёт не так — вернём {CURRENT.version}{" "}
    сами.
  </p>
);

export const Actions = () => {
  const { start, schedule, nightly } = useProto();
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={start}>Обновить сейчас</Button>
      <Button onClick={schedule} variant="outline">
        Ночью в {nightly}
      </Button>
    </div>
  );
};

type StepState = "waiting" | "running" | "done" | "failed";

const Mark = ({ state }: { state: StepState }) => (
  <span
    className={cn(
      "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-200",
      state === "done" && "bg-primary text-primary-foreground border-transparent",
      state === "running" && "bg-background border-foreground/30",
      state === "failed" && "bg-destructive border-transparent text-white",
      state === "waiting" && "bg-background text-muted-foreground"
    )}
  >
    {state === "done" && <Check className="size-3.5" />}
    {state === "running" && <Spinner className="size-3.5" />}
    {state === "failed" && <X className="size-3.5" />}
  </span>
);

/** The steps of the update, one under the other: done with what it took, the running one with what it is doing now. */
export const Progress = () => {
  const { phase, step, elapsed } = useProto();
  const stateOf = (i: number): StepState => {
    if (phase === "failed" && i === FAILURE.step) return "failed";
    if (i < step || phase === "done") return "done";
    return i === step && phase === "updating" ? "running" : "waiting";
  };
  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col gap-4">
        {/* The rail behind the marks. */}
        <span aria-hidden className="bg-border absolute top-3 bottom-3 left-[11px] w-px" />
        {STEPS.map((s, i) => {
          const state = stateOf(i);
          return (
            <li aria-current={state === "running" ? "step" : undefined} className="flex gap-3" key={s.key}>
              <Mark state={state} />
              <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                <span className={cn("text-sm font-medium", state === "waiting" && "text-muted-foreground font-normal")}>{s.title}</span>
                {state !== "waiting" && (
                  <span className={cn("text-xs", state === "failed" ? "text-destructive" : "text-muted-foreground")}>
                    {state === "done" ? s.done : state === "failed" ? FAILURE.reason : s.doing}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {phase === "updating" && (
        <p className="text-muted-foreground text-xs tabular-nums">
          Идёт {took(elapsed)} · обновление идёт на сервере, страницу можно закрыть
        </p>
      )}
    </div>
  );
};

/** How it ended: done — what is new now; failed — what came back and what to do. */
export const Outcome = () => {
  const { phase, elapsed, start } = useProto();
  if (phase === "done") {
    return (
      <Alert variant="success">
        <Check />
        <AlertTitle>Обновлено до {NEXT.version}</AlertTitle>
        <AlertDescription>
          За {took(elapsed)}. Копия базы до обновления лежит в истории ниже — на случай, если что-то всплывёт позже.
        </AlertDescription>
      </Alert>
    );
  }
  if (phase === "failed") {
    return (
      <Alert variant="destructive">
        <RotateCcw />
        <AlertTitle>Не обновилось — вернули {CURRENT.version}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>
            {FAILURE.reason} {FAILURE.restored}
          </span>
          <span className="flex flex-wrap gap-2">
            <Button onClick={start} size="sm" variant="outline">
              Попробовать снова
            </Button>
            <Button size="sm" variant="ghost">
              Журнал обновления
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    );
  }
  return null;
};

/** Automatic updates: the fixes on their own at night, new versions by the admin's button. */
export const Automatic = () => {
  const { autoPatch, setAutoPatch, nightly, setNightly } = useProto();
  return (
    <Section title="Автоматически">
      <Rows>
        <Row hint="0.4.0 → 0.4.1 ставятся сами в ночное время; новые версии — только по вашей кнопке" label="Ставить исправления сами">
          <Switch checked={autoPatch} onCheckedChange={setAutoPatch} />
        </Row>
        <Row hint="Когда ставить исправления и отложенные обновления" label="Ночное время">
          <Select onValueChange={(v) => setNightly(String(v))} value={nightly}>
            <SelectTrigger aria-label="Ночное время" className="w-full md:w-32">
              <SelectValue>{nightly}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {["01:00", "02:00", "03:00", "04:00", "05:00"].map((h) => (
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Rows>
    </Section>
  );
};

/** Past updates of this server, each with the copy of the base made before it. */
export const History = () => {
  const { phase, elapsed } = useProto();
  const fresh = phase === "done" ? [{ at: "2026-10-29T14:20", by: "Артём Маврин", from: CURRENT.version, took: took(elapsed), to: NEXT.version }] : [];
  const failed = phase === "failed" ? [{ at: "2026-10-29T14:20", by: "Артём Маврин", from: CURRENT.version, took: "откат", to: NEXT.version }] : [];
  const backups = phase === "done" || phase === "failed" ? [{ at: "2026-10-29T14:20", size: "48 МБ", version: CURRENT.version }, ...BACKUPS] : BACKUPS;
  return (
    <Section meta="копии базы — три последние" title="История">
      <Rows>
        {[...fresh, ...failed, ...HISTORY].map((h, i) => {
          const copy = backups.find((b) => b.at === h.at);
          return (
            <div className="flex items-center gap-3 px-4 py-3" key={`${h.at}-${i}`}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium tabular-nums">
                  {h.from ? `${h.from} → ${h.to}` : `Установлена ${h.to}`}
                  {h.took === "откат" && (
                    <Badge className="ml-2" size="sm" variant="destructive-light">
                      откат
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {dayTime(h.at)} · {h.by}
                  {h.took !== "откат" && ` · ${h.took}`}
                </span>
              </div>
              {copy && (
                <Button className="shrink-0" size="sm" variant="ghost">
                  <Database />
                  {copy.size}
                </Button>
              )}
            </div>
          );
        })}
      </Rows>
    </Section>
  );
};

/** No updater on this server: the new version and the command to run in its folder. */
export const Manual = () => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Обновлятель на этом сервере не включён. Запустите установщик в папке Metobe — он скачает {NEXT.version}, сохранит настройки и
        перезапустит:
      </p>
      <div className="bg-muted/60 flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{MANUAL}</code>
        <Button
          aria-label="Скопировать"
          onClick={() => {
            void navigator.clipboard?.writeText(MANUAL);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          size="icon-sm"
          variant="ghost"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Чтобы обновлять кнопкой, включите обновлятель: установщик спросит об этом при следующем запуске.</p>
    </div>
  );
};

export const Scheduled = () => {
  const { nightly, cancel, start } = useProto();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm">
        Обновится сегодня в <span className="font-medium">{nightly}</span>. Пользователи увидят плашку за 10 минут.
      </p>
      <div className="flex gap-2">
        <Button onClick={start} size="sm" variant="outline">
          Сейчас
        </Button>
        <Button onClick={cancel} size="sm" variant="ghost">
          Отменить
        </Button>
      </div>
    </div>
  );
};

/** The version line: what runs, and where the update stands. */
export const StatusBadge = () => {
  const { phase } = useProto();
  if (phase === "latest") return <Badge variant="success-light">последняя</Badge>;
  if (phase === "updating") return <Badge variant="primary-light">обновляется</Badge>;
  if (phase === "done") return <Badge variant="success-light">обновлено</Badge>;
  if (phase === "failed") return <Badge variant="destructive-light">откат</Badge>;
  if (phase === "scheduled") return <Badge variant="outline">ночью</Badge>;
  return <Badge variant="warning-light">есть новая</Badge>;
};
