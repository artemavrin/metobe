"use client";

// «Источники»: who gives access to models. Calm list → detail: a list with live health, a detail page with the check
// as an object, connection as settings rows, models grouped by provider with logos, a danger zone at the end.
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@purr/ui/components/popover";
import { Badge } from "@purr/ui/components/reui/badge";
import { Switch } from "@purr/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@purr/ui/components/tooltip";
import { cn } from "@purr/ui/lib/utils";
import { ChevronDown, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { BrandLogo, SOURCE_LOGO } from "../../_p7/brand";
import { ConnectDialog } from "../../_p7/connect-dialog";
import { byNewest, fmtContext, fmtPrice, isNew, type Model, providerBy } from "../../_p7/mock";
import { CapIcons, NO_AUTOFILL } from "../../_p7/shared";
import {
  DisconnectButton,
  KeyField,
  type PanelProvider,
  RecheckButton,
  RouteSelect,
  visibleInChat,
} from "../panel/common";
import type { Settings } from "./state";

/** Round-trip of the last check, deterministic per source (the real app stores the last check result). */
const latencyOf = (p: PanelProvider) => (p.kind === "yandex" ? 180 : p.kind === "compatible" ? 40 : 260) + (p.route.kind === "proxy" ? p.route.proxy.latency : 0);

const statusOf = (p: PanelProvider) => {
  if (p.enabled === false) return { dot: "bg-muted-foreground/40", text: "Выключен", tone: "muted" as const };
  if (p.health.state === "checking") return { dot: "bg-warning animate-pulse", text: "Проверяем…", tone: "muted" as const };
  if (p.health.state === "error") return { dot: "bg-destructive", text: "Ключ отозван", tone: "error" as const };
  return { dot: "bg-success", text: `Работает · ${latencyOf(p)} мс`, tone: "muted" as const };
};

export const SourcesPage = ({ s }: { s: Settings }) => {
  const { panel } = s;
  const [dialog, setDialog] = useState(false);
  const p = panel.current;
  const inChat = panel.list.reduce((a, x) => a + visibleInChat(x), 0);
  return (
    <div className="flex h-full min-h-0 text-sm">
      <aside className="flex w-80 shrink-0 flex-col border-r">
        <div className="flex items-start justify-between gap-2 px-5 pt-6 pb-3">
          <div>
            <h1 className="text-base font-semibold">Источники</h1>
            <p className="text-muted-foreground text-xs">
              {panel.list.length} подключено · {inChat} моделей в чате
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger render={<Button aria-label="Подключить источник" onClick={() => setDialog(true)} size="icon-sm" variant="outline" />}>
              <Plus />
            </TooltipTrigger>
            <TooltipContent>Подключить источник</TooltipContent>
          </Tooltip>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 pb-4">
          {panel.list.map((x) => {
            const st = statusOf(x);
            const active = x.kind === p?.kind;
            return (
              <button
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.99]",
                  active ? "bg-muted" : "hover:bg-muted/50"
                )}
                key={x.kind}
                onClick={() => panel.setSelected(x.kind)}
                type="button"
              >
                <BrandLogo label={providerBy(x.kind).title} logo={SOURCE_LOGO[x.kind]} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{providerBy(x.kind).title}</span>
                  <span className={cn("flex items-center gap-1.5 truncate text-xs", st.tone === "error" ? "text-destructive" : "text-muted-foreground")}>
                    <span className={cn("size-1.5 shrink-0 rounded-full", st.dot)} />
                    {st.text}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">{visibleInChat(x)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{p && <SourceDetail key={p.kind} p={p} s={s} />}</main>
      <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

const HealthPill = ({ p }: { p: PanelProvider }) => {
  const st = statusOf(p);
  const spec = providerBy(p.kind);
  const lines =
    p.health.state === "error"
      ? [
          ["GET /v1/models", "401 · authentication_error"],
          ["Ответ", "invalid x-api-key — ключ отозван или удалён в консоли"],
        ]
      : [
          ["GET /v1/models", `200 · ${spec.models.length + spec.hiddenCount} моделей`],
          ["Пробный запрос, 1 токен", `200 · ${latencyOf(p)} мс`],
        ];
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "hover:bg-muted inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-colors",
              st.tone === "error" && "border-destructive/30 text-destructive"
            )}
            type="button"
          />
        }
      >
        <span className={cn("size-1.5 rounded-full", st.dot)} />
        {p.health.state === "ok" ? `OK · ${latencyOf(p)} мс · ${p.health.checked}` : p.health.state === "error" ? `Ошибка · ${p.health.since}` : st.text}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        <div className="flex flex-col gap-3 text-sm">
          <span className="font-medium">Последняя проверка</span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {lines.map(([k, v]) => (
              <div className="contents" key={k}>
                <dt className="text-muted-foreground font-mono">{k}</dt>
                <dd className={cn("tabular-nums", p.health.state === "error" && "text-destructive")}>{v}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Маршрут</dt>
            <dd>{p.route.kind === "direct" ? "напрямую" : `через ${p.route.proxy.title} · ${p.route.proxy.country}`}</dd>
          </dl>
          <span className="text-muted-foreground text-xs">Проверяем настоящим запросом, а не форматом ключа: зелёный статус значит, что чат ответит.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const Section = ({ title, meta, action, children }: { title: string; meta?: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold">
        {title}
        {meta && <span className="text-muted-foreground ml-2 font-normal">{meta}</span>}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

const Row = ({ label, hint, children, action }: { label: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="grid grid-cols-[180px_1fr_auto] items-center gap-4 px-4 py-3">
    <div className="flex flex-col">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
    <div className="min-w-0">{children}</div>
    <div>{action}</div>
  </div>
);

const SourceDetail = ({ s, p }: { s: Settings; p: PanelProvider }) => {
  const { panel } = s;
  const spec = providerBy(p.kind);
  const broken = p.health.state === "error";
  const off = p.enabled === false;
  const [keyOpen, setKeyOpen] = useState(broken);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-10 pt-8 pb-24">
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <BrandLogo label={spec.title} logo={SOURCE_LOGO[p.kind]} size={48} />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{spec.title}</h1>
            <div className="flex items-center gap-2">
              <HealthPill p={p} />
              <span className="text-muted-foreground text-xs">{spec.blurb}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            Включён
            <Switch checked={!off} onCheckedChange={(v) => panel.setEnabled(p.kind, v)} />
          </label>
          <RecheckButton p={p} panel={panel} />
        </div>
      </header>

      {(broken || off) && (
        <div className={cn("flex items-center justify-between gap-4 rounded-lg border px-4 py-3", broken ? "border-destructive/25 bg-destructive/5" : "bg-muted/40")}>
          <span className="flex flex-col">
            <span className="font-medium">{broken ? "Модели этого источника скрыты из чата" : "Источник выключен"}</span>
            <span className="text-muted-foreground text-xs">
              {broken && p.health.state === "error" ? p.health.message : "Его модели не видны в чате. Ключ и настройки сохранены — включите, когда понадобится."}
            </span>
          </span>
          {broken ? (
            !keyOpen && (
              <Button className="shrink-0" onClick={() => setKeyOpen(true)} size="sm">
                Заменить ключ
              </Button>
            )
          ) : (
            <Button className="shrink-0" onClick={() => panel.setEnabled(p.kind, true)} size="sm" variant="outline">
              Включить
            </Button>
          )}
        </div>
      )}

      <Section title="Подключение">
        <div className="divide-y rounded-lg border">
          <Row
            action={
              <Button onClick={() => setKeyOpen((v) => !v)} size="sm" variant="ghost">
                {keyOpen ? "Отмена" : "Заменить"}
              </Button>
            }
            hint="Хранится зашифрованным"
            label="Ключ"
          >
            <span className={cn("font-mono", broken && "text-destructive")}>••••{p.keyTail}</span>
          </Row>
          {keyOpen && (
            <div className="animate-in fade-in slide-in-from-top-1 fill-mode-both bg-muted/30 px-4 py-4 duration-200 ease-out">
              <div className="ml-[196px] max-w-md">
                <KeyField onDone={() => setKeyOpen(false)} p={p} panel={panel} />
              </div>
            </div>
          )}
          {spec.extraField && (
            <Row hint={spec.extraField.hint} label={spec.extraField.label}>
              <span className="font-mono">{p.kind === "yandex" ? "b1g8f2k4m9q1r7t3v5x0" : "http://ollama:11434/v1"}</span>
            </Row>
          )}
          <Row hint="Как запросы выходят в интернет" label="Маршрут">
            <RouteSelect className="w-72" p={p} panel={panel} />
          </Row>
        </div>
      </Section>

      <ModelsSection p={p} s={s} />

      <Section title="Отключение">
        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <span className="flex flex-col">
            <span className="font-medium">Отключить {spec.title}</span>
            <span className="text-muted-foreground text-xs">Ключ удалится, модели пропадут из чата. История чатов останется.</span>
          </span>
          <DisconnectButton p={p} panel={panel} />
        </div>
      </Section>
    </div>
  );
};

type Group = { info: ReturnType<Settings["providerOf"]>; models: Model[] };

/** The biggest providers as chips, the long tail (AI Gateway has dozens) behind «Ещё N» — one row, never a wall. */
const TOP = 6;
const ProviderChips = ({ groups, picked, setPicked }: { groups: Group[]; picked: string[]; setPicked: (f: (all: string[]) => string[]) => void }) => {
  const ranked = [...groups].sort((a, b) => b.models.length - a.models.length);
  const top = ranked.filter((g, i) => i < TOP || picked.includes(g.info.slug));
  const rest = ranked.filter((g) => !top.includes(g));
  const toggle = (slug: string) => setPicked((all) => (all.includes(slug) ? all.filter((x) => x !== slug) : [...all, slug]));
  const chip = (g: Group) => {
    const on = picked.includes(g.info.slug);
    return (
      <button
        aria-pressed={on}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border pr-2.5 pl-1.5 text-xs transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]",
          on ? "border-foreground/40 bg-muted" : "hover:bg-muted/60 text-muted-foreground"
        )}
        key={g.info.slug}
        onClick={() => toggle(g.info.slug)}
        type="button"
      >
        <BrandLogo label={g.info.title} logo={g.info.logo} size={20} />
        {g.info.title}
        <span className="text-muted-foreground tabular-nums">{g.models.length}</span>
      </button>
    );
  };
  return (
    <>
      {top.map(chip)}
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger render={<button className="hover:bg-muted/60 text-muted-foreground flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs" type="button" />}>
            Ещё {rest.length}
            <ChevronDown className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <div className="flex max-h-80 flex-col overflow-y-auto">
              {rest.map((g) => (
                <button className="hover:bg-muted flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm" key={g.info.slug} onClick={() => toggle(g.info.slug)} type="button">
                  <BrandLogo label={g.info.title} logo={g.info.logo} size={22} />
                  <span className="flex-1">{g.info.title}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">{g.models.length}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
};

const ModelsSection = ({ s, p }: { s: Settings; p: PanelProvider }) => {
  const { panel } = s;
  const spec = providerBy(p.kind);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [onlyOn, setOnlyOn] = useState(false);
  const models = useMemo(() => [...spec.models].sort(byNewest), [spec]);
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const m of models) {
      const info = s.providerOf(m);
      const g = map.get(info.slug) ?? { info, models: [] };
      g.models.push(m);
      map.set(info.slug, g);
    }
    return [...map.values()];
  }, [models, s]);
  const multi = groups.length > 1;
  const matches = (m: Model) =>
    (!picked.length || picked.includes(s.providerOf(m).slug)) &&
    (!onlyOn || p.models.has(m.id)) &&
    `${m.title} ${m.id} ${m.vendor}`.toLowerCase().includes(q.trim().toLowerCase());
  const shown = models.filter(matches);
  const dim = p.enabled === false || p.health.state === "error";

  const setGroup = (ids: string[], on: boolean) => {
    const next = new Set(p.models);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    panel.setModels(p.kind, next);
  };

  return (
    <Section
      action={
        <span className="flex gap-1">
          <Button onClick={() => setGroup(shown.map((m) => m.id), true)} size="xs" variant="ghost">
            Включить показанные
          </Button>
          <Button onClick={() => setGroup(shown.map((m) => m.id), false)} size="xs" variant="ghost">
            Выключить
          </Button>
        </span>
      }
      meta={`${p.models.size} из ${spec.models.length} в чате`}
      title="Модели"
    >
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Модель или id" value={q} />
        </InputGroup>
        <button
          aria-pressed={onlyOn}
          className={cn("h-8 rounded-lg border px-3 text-xs transition-colors", onlyOn ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}
          onClick={() => setOnlyOn((v) => !v)}
          type="button"
        >
          В чате
        </button>
      </div>
      {multi && (
        <div className="flex flex-wrap items-center gap-2">
          <ProviderChips groups={groups} picked={picked} setPicked={setPicked} />
        </div>
      )}

      <div className={cn("overflow-hidden rounded-lg border", dim && "opacity-60")}>
        {groups.map((g) => {
          const list = g.models.filter(matches);
          if (!list.length) return null;
          const onCount = g.models.filter((m) => p.models.has(m.id)).length;
          return (
            <div className="border-b last:border-b-0" key={g.info.slug}>
              {multi && (
                <div className="bg-muted/40 flex items-center gap-2.5 px-4 py-2">
                  <BrandLogo label={g.info.title} logo={g.info.logo} size={22} />
                  <span className="font-medium">{g.info.title}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {onCount} из {g.models.length}
                  </span>
                  <Switch
                    aria-label={`Все модели ${g.info.title}`}
                    checked={onCount === g.models.length}
                    className="ml-auto"
                    onCheckedChange={(v) => setGroup(g.models.map((m) => m.id), v)}
                    size="sm"
                  />
                </div>
              )}
              <ul className="divide-y">
                {list.map((m) => (
                  <ModelRow key={m.id} m={m} multi={multi} on={p.models.has(m.id)} onToggle={(v) => panel.toggleModel(p.kind, m.id, v)} s={s} />
                ))}
              </ul>
            </div>
          );
        })}
        {!shown.length && <p className="text-muted-foreground px-4 py-10 text-center">Ничего не нашлось</p>}
      </div>
      {spec.hiddenCount > 0 && <p className="text-muted-foreground text-xs">Ещё {spec.hiddenCount} не для чата: {spec.hiddenNote}.</p>}
    </Section>
  );
};

const ModelRow = ({ m, on, onToggle, multi, s }: { m: Model; on: boolean; onToggle: (v: boolean) => void; multi: boolean; s: Settings }) => {
  const info = s.providerOf(m);
  const id = `m-${m.id}`;
  return (
    <li>
      <label className={cn("hover:bg-muted/30 flex cursor-pointer items-center gap-3 py-2.5 pr-4", multi ? "pl-12" : "pl-4")} htmlFor={id}>
        {!multi && <BrandLogo label={info.title} logo={info.logo} size={22} />}
        <span className={cn("flex min-w-0 flex-1 items-center gap-2", !on && "text-muted-foreground")}>
          <span className="truncate font-medium">{m.title}</span>
          {isNew(m) && (
            <Badge size="sm" variant="info-light">
              новая
            </Badge>
          )}
        </span>
        <span className="hidden md:inline-flex">
          <CapIcons caps={m.caps} />
        </span>
        <span className="text-muted-foreground w-14 text-right text-xs tabular-nums">{fmtContext(m.context)}</span>
        <span className="text-muted-foreground w-28 text-right text-xs tabular-nums">{fmtPrice(m)}</span>
        <Switch checked={on} id={id} onCheckedChange={onToggle} size="sm" />
      </label>
    </li>
  );
};

