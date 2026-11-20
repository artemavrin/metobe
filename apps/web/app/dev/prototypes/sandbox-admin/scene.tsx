"use client";

import { Button } from "@metobe/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@metobe/ui/components/dialog";
import { Input } from "@metobe/ui/components/input";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { CircleAlert, Pencil, Power, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import { useProto } from "../memory/frame";
import { usePhone } from "../privacy/frame";
import { DEFAULTS, FIELDS, SETTINGS_MENU, boxesFor, fieldError, memoryNote } from "./data";
import type { Box, Limits, Load } from "./data";

// Сцена P35: раздел администратора «Песочница». Общее у вариантов — выключатель, состояние, интернет и пределы,
// которые теперь правятся здесь (хранятся в базе, а не в `.env`). Разное — как видно, что сейчас занято, и как
// правятся пределы: «Строки» — список и правка в строках; «Места» — у каждого места своя карточка, как в
// PlusPortal; «Сводка» — три числа сверху, список под ними, пределы — окном.

// ── Окно настроек ─────────────────────────────────────────────────────────────────────────────────────────────────────

const Window = ({ children }: { children: ReactNode }) => {
  const phone = usePhone();
  if (phone) {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8 max-sm:py-0">
        <div className="bg-background text-foreground relative flex h-[812px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border pt-6 shadow-xl max-sm:h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0 max-sm:pt-0">
          <div className="flex h-12 shrink-0 items-center border-b px-4 text-sm font-medium">Песочница</div>
          <div className="@container min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-1 border-r p-2 text-sm">
        <span className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase">Администрирование</span>
        {SETTINGS_MENU.map((item) => (
          <span className={cn("rounded-md px-2 py-1.5", item === "Песочница" ? "bg-sidebar-accent font-medium" : "text-muted-foreground")} key={item}>
            {item}
          </span>
        ))}
      </aside>
      <main className="@container min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

// ── Состояние ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const Dot = ({ tone, pulse }: { tone: "ok" | "bad" | "warn" | "off"; pulse?: boolean }) => (
  <span
    className={cn(
      "size-2 shrink-0 rounded-full",
      tone === "ok" && "bg-success",
      tone === "bad" && "bg-destructive",
      tone === "warn" && "bg-warning",
      tone === "off" && "bg-muted-foreground/40",
      pulse && "animate-pulse"
    )}
  />
);

const useSandbox = () => {
  const { knobs } = useProto();
  const svc = knobs.svc as "ok" | "runc" | "down";
  const [enabled, setEnabled] = useState(true);
  const [network, setNetwork] = useState(false);
  const [limits, setLimits] = useState<Limits>(DEFAULTS);
  const start = boxesFor(knobs.load as Load);
  const [gone, setGone] = useState<string[]>([]);
  const boxes = svc === "down" || !enabled ? [] : start.boxes.filter((b) => !gone.includes(b.id));
  const waiting = svc === "down" || !enabled ? 0 : start.waiting;
  return { boxes, down: svc === "down", enabled, kill: (id: string) => setGone((g) => [...g, id]), limits, network, runc: svc === "runc", setEnabled, setLimits, setNetwork, waiting };
};
type State = ReturnType<typeof useSandbox>;

const Check = () => {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={() => {
        setBusy(true);
        setTimeout(() => setBusy(false), 900);
      }}
      size="sm"
      variant="outline"
    >
      <RefreshCw className={cn(busy && "animate-spin")} />
      Проверить
    </Button>
  );
};

const StatusRows = ({ s }: { s: State }) => (
  <Rows>
    <Row label="Работает ли">
      <span className="flex items-center gap-2">
        <Dot tone={s.down ? "bad" : "ok"} />
        {s.down ? "Не отвечает: соединение отклонено" : "Готова"}
      </span>
    </Row>
    {!s.down && (
      <Row hint={s.runc ? "Код модели выполняется в обычном контейнере. На сервере так нельзя." : undefined} label="Изоляция">
        <span className="flex items-center gap-2">
          <Dot tone={s.runc ? "bad" : "ok"} />
          {s.runc ? "Без gVisor, только для разработки" : "gVisor"}
        </span>
      </Row>
    )}
    {!s.down && (
      <Row label="Образ">
        <span className="font-mono text-sm break-all">ghcr.io/metobe/sandbox:1</span>
      </Row>
    )}
  </Rows>
);

const DownAlert = () => (
  <Alert variant="destructive">
    <CircleAlert />
    <AlertDescription>Сервис песочницы не отвечает: модели в чатах работают без кода. Пределы можно менять — сервис возьмёт их, когда поднимется.</AlertDescription>
  </Alert>
);

const Head = ({ s }: { s: State }) => (
  <>
    <SettingsHeader description="Здесь модель выполняет код на Python: считает данные из файлов и делает таблицы, документы, презентации и графики." title="Песочница" />
    <Rows>
      <Row hint={s.enabled ? "Модель в чатах и задачах считает данные и делает файлы" : "Модель отвечает без кода и файлов, песочницы погашены"} label="Включить песочницу">
        <Switch aria-label="Включить песочницу" checked={s.enabled} onCheckedChange={s.setEnabled} />
      </Row>
    </Rows>
  </>
);

const Network = ({ s }: { s: State }) => (
  <Section title="Доступ">
    <Rows>
      <Row hint={s.network ? "Код скачивает пакеты и данные по ссылкам" : "Код не скачивает пакеты и ничего не отправляет наружу"} label="Интернет из песочницы">
        <Switch aria-label="Интернет из песочницы" checked={s.network} disabled={!s.enabled} onCheckedChange={s.setNetwork} />
      </Row>
    </Rows>
    {s.network && (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertDescription>Код модели сможет отправить содержимое файлов на любой адрес. Включайте, только если без пакетов из интернета не обойтись.</AlertDescription>
      </Alert>
    )}
  </Section>
);

// ── Погасить ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const KillDialog = ({ box, onClose, onKill }: { box: Box | null; onClose: () => void; onKill: (id: string) => void }) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={box !== null}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Погасить песочницу?</DialogTitle>
        <DialogDescription>
          {box?.busy ? "Код, который выполняется сейчас, остановится. " : ""}
          Файлы в песочнице пропадут, следующий ответ в {box?.kind === "task" ? "задаче" : "чате"} начнёт с новой. Файлы, уже отданные в чат, останутся.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Отмена
        </Button>
        <Button
          onClick={() => {
            if (box) onKill(box.id);
            onClose();
          }}
          variant="destructive"
        >
          Погасить
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const useKill = (s: State) => {
  const [target, setTarget] = useState<Box | null>(null);
  return { ask: setTarget, dialog: <KillDialog box={target} onClose={() => setTarget(null)} onKill={s.kill} /> };
};

const kindWord = (b: Box) => (b.kind === "task" ? "задача" : "чат");
const stateWord = (b: Box) => (b.busy ? "Выполняет код" : `Ждёт до ${b.until}`);
const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

const Face = ({ name }: { name: string }) => (
  <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">{initials(name)}</span>
);

const waitingWord = (n: number) => (n === 1 ? "1 ждёт места" : `${n} ждут места`);

// ── «Сейчас» списком ──────────────────────────────────────────────────────────────────────────────────────────────────

const BoxList = ({ s, onKill }: { s: State; onKill: (b: Box) => void }) =>
  s.boxes.length === 0 ? (
    <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">Песочниц нет — появятся, когда модель запустит код</p>
  ) : (
    <ul className="divide-y rounded-lg border">
      {s.boxes.map((b) => (
        <li className="group flex min-h-14 items-center gap-3 px-4 py-2.5" key={b.id}>
          <Face name={b.person} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{b.person}</span>
            <span className="text-muted-foreground text-xs">
              {kindWord(b)} · {b.age} мин
            </span>
          </span>
          <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-sm tabular-nums">
            <Dot pulse={b.busy} tone={b.busy ? "warn" : "off"} />
            <span className="max-sm:hidden">{stateWord(b)}</span>
          </span>
          <Button
            aria-label="Погасить"
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            onClick={() => onKill(b)}
            size="icon-sm"
            variant="ghost"
          >
            <Power />
          </Button>
        </li>
      ))}
    </ul>
  );

// ── «Сейчас» местами ──────────────────────────────────────────────────────────────────────────────────────────────────

const SlotBoard = ({ s, onKill }: { s: State; onKill: (b: Box) => void }) => {
  const free = Math.max(0, s.limits.total - s.boxes.length);
  return (
    <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-4">
      {s.boxes.map((b) => (
        <div className="bg-card group relative flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3" key={b.id}>
          <Button
            aria-label="Погасить"
            className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            onClick={() => onKill(b)}
            size="icon-xs"
            variant="ghost"
          >
            <X />
          </Button>
          <span className="flex min-w-0 items-center gap-2.5 pr-4">
            <Face name={b.person} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{b.person}</span>
              <span className="text-muted-foreground text-xs">
                {kindWord(b)} · {b.age} мин
              </span>
            </span>
          </span>
          <span className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
            <Dot pulse={b.busy} tone={b.busy ? "warn" : "off"} />
            {stateWord(b)}
          </span>
        </div>
      ))}
      {Array.from({ length: free }, (_, i) => (
        <div className="text-muted-foreground flex min-h-28 items-center justify-center rounded-lg border border-dashed text-sm" key={`free-${i}`}>
          Свободно
        </div>
      ))}
    </div>
  );
};

// ── Пределы ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const valueText = (l: Limits, key: keyof Limits) => {
  const f = FIELDS.find((x) => x.key === key);
  return `${l[key]} ${f?.unit ?? ""}`.trim();
};

const LimitInput = ({ draft, setDraft, k, unit }: { draft: Limits; setDraft: (l: Limits) => void; k: keyof Limits; unit: string }) => (
  <span className="flex items-center gap-2">
    <Input
      aria-label={FIELDS.find((f) => f.key === k)?.label}
      className="w-24 text-right tabular-nums"
      inputMode="numeric"
      onChange={(e) => setDraft({ ...draft, [k]: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
      value={Number.isNaN(draft[k]) ? "" : draft[k]}
    />
    <span className="text-muted-foreground w-8 text-sm">{unit}</span>
  </span>
);

const LimitRows = ({ limits, draft, setDraft }: { limits: Limits; draft: Limits | null; setDraft: (l: Limits) => void }) => (
  <Rows>
    {FIELDS.map((f) => {
      const error = draft ? fieldError(f, draft) : null;
      return (
        <Row hint={f.hint} key={f.key} label={f.label}>
          {draft ? (
            <span className="flex flex-col items-end gap-1">
              <LimitInput draft={draft} k={f.key} setDraft={setDraft} unit={f.unit} />
              {error && <span className="text-destructive text-xs">{error}</span>}
            </span>
          ) : (
            <span className="tabular-nums">{valueText(limits, f.key)}</span>
          )}
        </Row>
      );
    })}
  </Rows>
);

const hasErrors = (l: Limits) => FIELDS.some((f) => fieldError(f, l));

const MemoryNote = ({ l }: { l: Limits }) => {
  const note = memoryNote(Number.isNaN(l.total) || Number.isNaN(l.memoryMb) ? DEFAULTS : l);
  return (
    <p className={cn("text-xs", note.over ? "text-destructive" : "text-muted-foreground")}>
      {note.text}
      {note.over && " — серверу может не хватить памяти"}. Новые пределы действуют для новых песочниц, работающие доживают со старыми.
    </p>
  );
};

/** Правка на месте: «Изменить» → поля в строках → «Готово» / крестик. */
const LimitsInline = ({ s }: { s: State }) => {
  const [draft, setDraft] = useState<Limits | null>(null);
  const action = draft ? (
    <span className="flex gap-1">
      <Button aria-label="Отменить" onClick={() => setDraft(null)} size="icon-sm" variant="ghost">
        <X />
      </Button>
      <Button
        disabled={hasErrors(draft)}
        onClick={() => {
          s.setLimits(draft);
          setDraft(null);
        }}
        size="sm"
      >
        Готово
      </Button>
    </span>
  ) : (
    <Button onClick={() => setDraft(s.limits)} size="sm" variant="outline">
      <Pencil />
      Изменить
    </Button>
  );
  return (
    <Section action={action} title="Пределы">
      <LimitRows draft={draft} limits={s.limits} setDraft={setDraft} />
      <MemoryNote l={draft ?? s.limits} />
    </Section>
  );
};

/** Правка окном: таблица только для чтения, «Изменить» открывает окно с полями. */
// Отвергнуто 2026-11-21: правка окном. Оставлено для истории раунда.
export const LimitsDialog = ({ s }: { s: State }) => {
  const [draft, setDraft] = useState<Limits | null>(null);
  return (
    <Section
      action={
        <Button onClick={() => setDraft(s.limits)} size="sm" variant="outline">
          <Pencil />
          Изменить
        </Button>
      }
      title="Пределы"
    >
      <LimitRows draft={null} limits={s.limits} setDraft={setDraft} />
      <MemoryNote l={s.limits} />
      <Dialog onOpenChange={(open) => !open && setDraft(null)} open={draft !== null}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Пределы песочницы</DialogTitle>
            <DialogDescription>Новые пределы действуют для новых песочниц.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-4">
              {FIELDS.map((f) => {
                const error = fieldError(f, draft);
                return (
                  <div className="flex items-center justify-between gap-4" key={f.key}>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{f.label}</span>
                      <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? f.hint}</span>
                    </span>
                    <LimitInput draft={draft} k={f.key} setDraft={setDraft} unit={f.unit} />
                  </div>
                );
              })}
              <MemoryNote l={draft} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDraft(null)} variant="outline">
              Отмена
            </Button>
            <Button
              disabled={!draft || hasErrors(draft)}
              onClick={() => {
                if (draft) s.setLimits(draft);
                setDraft(null);
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
};

// ── Варианты ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const nowMeta = (s: State) => {
  const busy = `${s.boxes.length} из ${s.limits.total}`;
  return s.waiting > 0 ? `${busy} · ${waitingWord(s.waiting)}` : busy;
};

export const Lines = () => {
  const s = useSandbox();
  const kill = useKill(s);
  return (
    <Window>
      <SettingsPageFrame>
        <Head s={s} />
        <Section action={<Check />} title="Состояние">
          {s.down && <DownAlert />}
          <StatusRows s={s} />
        </Section>
        {!s.down && s.enabled && (
          <Section meta={nowMeta(s)} title="Сейчас">
            <BoxList onKill={kill.ask} s={s} />
          </Section>
        )}
        <LimitsInline s={s} />
        <Network s={s} />
        {kill.dialog}
      </SettingsPageFrame>
    </Window>
  );
};

export const Slots = () => {
  const s = useSandbox();
  const kill = useKill(s);
  return (
    <Window>
      <SettingsPageFrame>
        <Head s={s} />
        <Section action={<Check />} title="Состояние">
          {s.down && <DownAlert />}
          <StatusRows s={s} />
        </Section>
        {!s.down && s.enabled && (
          <Section meta={nowMeta(s)} title="Места">
            <SlotBoard onKill={kill.ask} s={s} />
            {s.waiting > 0 && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Dot pulse tone="warn" />
                {waitingWord(s.waiting)}: займут первое освободившееся, чат раньше задачи
              </p>
            )}
          </Section>
        )}
        <LimitsInline s={s} />
        <Network s={s} />
        {kill.dialog}
      </SettingsPageFrame>
    </Window>
  );
};

const Tile = ({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "bad" | "warn" }) => (
  <div className="flex flex-col gap-1 rounded-lg border px-4 py-3">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="flex items-center gap-2 text-lg font-semibold tabular-nums">
      {tone && <Dot tone={tone} />}
      {value}
    </span>
  </div>
);

export const Summary = () => {
  const s = useSandbox();
  const kill = useKill(s);
  return (
    <Window>
      <SettingsPageFrame>
        <Head s={s} />
        {s.down ? (
          <Section action={<Check />} title="Состояние">
            <DownAlert />
            <StatusRows s={s} />
          </Section>
        ) : (
          <Section action={<Check />} meta={s.runc ? "без gVisor — только для разработки" : "gVisor · ghcr.io/metobe/sandbox:1"} title="Сейчас">
            <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
              <Tile label="Работает" tone={s.runc ? "bad" : "ok"} value={s.enabled ? "Готова" : "Выключена"} />
              <Tile label="Занято" tone={s.boxes.length >= s.limits.total ? "warn" : undefined} value={`${s.boxes.length} из ${s.limits.total}`} />
              <Tile label="Ждут места" tone={s.waiting > 0 ? "warn" : undefined} value={s.waiting} />
            </div>
            {s.enabled && <BoxList onKill={kill.ask} s={s} />}
          </Section>
        )}
        <LimitsInline s={s} />
        <Network s={s} />
        {kill.dialog}
      </SettingsPageFrame>
    </Window>
  );
};
