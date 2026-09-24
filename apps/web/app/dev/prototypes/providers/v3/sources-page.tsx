"use client";

// «Источники»: who gives access to models. Calm list → detail: a list with live health, a detail page with the check
// as an object, connection as settings rows, models grouped by provider with logos, a danger zone at the end.
import { SettingsPageFrame } from "../../app-shell/shell-modes";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@metobe/ui/components/input-group";
import { Spinner } from "@metobe/ui/components/spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Switch } from "@metobe/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Network, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { BrandLogo } from "../../_p7/brand";
import { ConnectDialog } from "../../_p7/connect-dialog";
import { byNewest, fmtContext, fmtPrice, isNew, type Model, providerBy, SAMPLE_KEYS } from "../../_p7/mock";
import { CapIcons, MASKED, NO_AUTOFILL } from "../../_p7/shared";
import {
  DisconnectButton,
  type PanelProvider,
  RecheckButton,
  visibleInChat,
} from "../panel/common";
import { EditRow, LIST_PANEL, LogoPicker, Row, RowEditor, Section, useListHighlight } from "./parts";
import { COUNTRY, type ProxyEntry, type Settings } from "./state";

/** Round-trip of the last check, deterministic per source (the real app stores the last check result). */
const latencyOf = (p: PanelProvider, s: Settings) => {
  const via = s.routeOf(p).proxy;
  return (p.kind === "yandex" ? 180 : p.kind === "compatible" ? 40 : 260) + (via?.health.state === "ok" ? via.health.latency : 0);
};

export const statusOf = (p: PanelProvider, s: Settings) => {
  if (p.enabled === false) return { dot: "bg-muted-foreground/40", text: "Выключен", tone: "muted" as const };
  if (p.health.state === "checking") return { dot: "bg-warning animate-pulse", text: "Проверяем…", tone: "muted" as const };
  if (p.health.state === "error") return { dot: "bg-destructive", text: "Ключ отозван", tone: "error" as const };
  return { dot: "bg-success", text: `Работает · ${latencyOf(p, s)} мс`, tone: "muted" as const };
};

export const SourcesPage = ({ s }: { s: Settings }) => {
  const { panel } = s;
  const [dialog, setDialog] = useState(false);
  const p = panel.current;
  const inChat = panel.list.reduce((a, x) => a + visibleInChat(x), 0);
  const list = useListHighlight(p?.kind, panel.list.length);
  return (
    <div className="flex h-full min-h-0 text-sm">
      <aside className={LIST_PANEL}>
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
        <nav className="relative flex flex-col gap-0.5 px-2 pb-4" ref={list.ref}>
          {list.highlight}
          {panel.list.map((x) => {
            const st = statusOf(x, s);
            const active = x.kind === p?.kind;
            return (
              <button
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.99]",
                  "relative",
                  !active && "hover:bg-sidebar-accent/60"
                )}
                data-active={active}
                key={x.kind}
                onClick={() => panel.setSelected(x.kind)}
                type="button"
              >
                <BrandLogo label={s.sourceOf(x.kind).title} logo={s.sourceOf(x.kind).logo} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{s.sourceOf(x.kind).title}</span>
                  <span className={cn("flex items-center gap-1.5 truncate text-xs", st.tone === "error" ? "text-destructive" : "text-muted-foreground")}>
                    <span className={cn("v3-dot size-1.5 shrink-0 rounded-full", st.dot)} />
                    {st.text}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">{visibleInChat(x)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{p && (
          <SettingsPageFrame key={p.kind}>
            <SourceDetail p={p} s={s} />
          </SettingsPageFrame>
        )}</main>
      <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setDialog} open={dialog} />
    </div>
  );
};

const HealthPill = ({ p, s }: { p: PanelProvider; s: Settings }) => {
  const st = statusOf(p, s);
  const route = s.routeOf(p);
  const spec = providerBy(p.kind);
  const lines =
    p.health.state === "error"
      ? [
          ["GET /v1/models", "401 · authentication_error"],
          ["Ответ", "invalid x-api-key — ключ отозван или удалён в консоли"],
        ]
      : [
          ["GET /v1/models", `200 · ${spec.models.length + spec.hiddenCount} моделей`],
          ["Пробный запрос, 1 токен", `200 · ${latencyOf(p, s)} мс`],
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
        <span className={cn("v3-dot size-1.5 rounded-full", st.dot)} />
        <span className="v3-appear" key={p.health.state}>
          {p.health.state === "ok" ? `OK · ${latencyOf(p, s)} мс · ${p.health.checked}` : p.health.state === "error" ? `Ошибка · ${p.health.since}` : st.text}
      </span>
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
            <dd>{route.proxy ? `через ${route.proxy.title}` : "напрямую"}</dd>
          </dl>
          <span className="text-muted-foreground text-xs">Проверяем настоящим запросом, а не форматом ключа: зелёный статус значит, что чат ответит.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** The source's side of «what goes through which proxy» (ARCH §18): the same field the proxy page edits. */
const RouteField = ({ p, s }: { p: PanelProvider; s: Settings }) => {
  const route = s.routeOf(p);
  const ready = s.proxies.filter((x) => x.address);
  const mark = (x: ProxyEntry) => (x.health.state === "ok" ? (COUNTRY[x.health.country]?.flag ?? "") : "");
  const why =
    route.why === "domain"
      ? `Домен ${route.domain} отмечен у «${route.proxy?.title}»`
      : route.why === "auto-direct"
        ? "Ни у одного прокси нет его домена"
        : route.why === "explicit"
          ? "Всегда через этот прокси, домены не учитываются"
          : "Всегда напрямую, даже если домен отмечен у прокси";
  return (
    <div className="flex flex-col items-end gap-1">
      <Select onValueChange={(v) => s.panel.setRoute(p.kind, String(v))} value={p.routeMode}>
        <SelectTrigger className="w-72">
          <SelectValue>
            {p.routeMode === "auto" ? (
              <span className="flex items-center gap-1.5">
                Авто <span className="text-muted-foreground">·</span>
                {route.proxy ? `${mark(route.proxy)} ${route.proxy.title}` : "напрямую"}
              </span>
            ) : p.routeMode === "direct" ? (
              "Напрямую"
            ) : route.proxy ? (
              `${mark(route.proxy)} ${route.proxy.title}`
            ) : (
              "Удалённый прокси"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-72">
          <SelectItem value="auto">
            <span className="flex flex-col">
              Авто
              <span className="text-muted-foreground text-xs">по доменам, отмеченным у прокси</span>
            </span>
          </SelectItem>
          <SelectItem value="direct">Напрямую</SelectItem>
          {ready.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Прокси</SelectLabel>
                {ready.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    <span className="flex w-full items-center gap-2">
                      <span className="w-5 text-center">{mark(x) || <Network className="text-muted-foreground size-3.5" />}</span>
                      <span className="flex-1">{x.title}</span>
                      {x.health.state === "ok" && <span className="text-muted-foreground text-xs tabular-nums">{x.health.latency} мс</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground text-right text-xs">{why}</span>
    </div>
  );
};

/**
 * The key, replaced in place like any other value: «Заменить» turns the masked tail into a field; Enter checks and
 * saves, Esc cancels. The old key stays until the new one passes a real request.
 */
const KeyRow = ({ p, s, broken, open, onOpenChange }: { p: PanelProvider; s: Settings; broken: boolean; open: boolean; onOpenChange: (v: boolean) => void }) => {
  const [key, setKey] = useState("");
  const [failed, setFailed] = useState(false);
  const checking = p.health.state === "checking";
  const spec = providerBy(p.kind);
  const close = () => {
    setKey("");
    setFailed(false);
    onOpenChange(false);
  };
  const submit = async () => {
    if (!key.trim() || checking) return;
    const ok = await s.panel.replaceKey(p.kind, key);
    setFailed(!ok);
    if (ok) close();
  };
  return (
    <Row
      action={
        <Button onClick={() => onOpenChange(true)} size="sm" variant="ghost">
          Заменить
        </Button>
      }
      editor={
        open ? (
          <RowEditor
            error={failed && "Ключ не подошёл — старый остаётся в силе"}
            field={
              <InputGroup>
                <InputGroupInput
                  {...NO_AUTOFILL}
                  aria-invalid={failed || undefined}
                  aria-label="Новый ключ"
                  autoFocus
                  className={cn("font-mono", key && MASKED)}
                  disabled={checking}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setFailed(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      close();
                    }
                  }}
                  placeholder={spec.keyPlaceholder}
                  value={key}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton disabled={checking} onClick={() => setKey(SAMPLE_KEYS[p.kind])} size="xs">
                    Пример
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            }
            onCancel={checking ? undefined : close}
            primary={
              <Button disabled={checking || !key.trim()} onClick={() => void submit()} size="sm">
                {checking && <Spinner className="size-3.5" />} Проверить
              </Button>
            }
          />
        ) : undefined
      }
      hint={open ? `Сейчас ••••${p.keyTail}. Старый ключ работает, пока новый не пройдёт проверку` : "Хранится зашифрованным"}
      label="Ключ"
    >
      {p.keyTail ? (
        <span className={cn("font-mono", broken && "text-destructive")}>••••{p.keyTail}</span>
      ) : (
        <span className="text-muted-foreground">без ключа</span>
      )}
    </Row>
  );
};

export const SourceDetail = ({ s, p }: { s: Settings; p: PanelProvider }) => {
  const { panel } = s;
  const spec = providerBy(p.kind);
  const broken = p.health.state === "error";
  const off = p.enabled === false;
  const [keyOpen, setKeyOpen] = useState(broken);
  const brand = s.sourceOf(p.kind);
  const [name, setName] = useState(brand.title);

  return (
    <>
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoPicker hosts label={brand.title} onPick={(logo) => s.setSourceOverride(p.kind, { logo })} size={48} value={brand.logo} />
          <div className="flex flex-col gap-1.5">
            <Input
              {...NO_AUTOFILL}
              aria-label="Название источника"
              className="hover:border-border focus-visible:border-ring h-auto border-transparent bg-transparent px-1.5 py-0 text-xl font-semibold tracking-tight shadow-none md:text-xl dark:bg-transparent"
              onBlur={() => s.setSourceOverride(p.kind, { title: name.trim() || undefined })}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder={spec.title}
              value={name}
            />
            <div className="flex items-center gap-2 px-1.5">
              <HealthPill p={p} s={s} />
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
        <div className={cn("v3-drop-in flex items-center justify-between gap-4 rounded-lg border px-4 py-3", broken ? "border-destructive/25 bg-destructive/5" : "bg-muted/40")}>
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
          <KeyRow broken={broken} onOpenChange={setKeyOpen} open={keyOpen} p={p} s={s} />
          {spec.extraField && (
            <EditRow
              check={(v) => (p.kind === "yandex" && !v.startsWith("b1g") ? "ID каталога начинается с b1g — скопируйте его в консоли Yandex Cloud" : null)}
              hint={spec.extraField.hint}
              key={p.extra}
              label={spec.extraField.label}
              onSave={(v) => void panel.setExtra(p.kind, v)}
              placeholder={spec.extraField.placeholder}
              value={p.extra ?? ""}
            />
          )}
          <Row hint="Прокси заводятся в «Системе → Прокси»" label="Маршрут">
            <RouteField p={p} s={s} />
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
    </>
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
              
              <ul className="divide-y">
                {list.map((m) => (
                  <ModelRow key={m.id} m={m} on={p.models.has(m.id)} onToggle={(v) => panel.toggleModel(p.kind, m.id, v)} />
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

const ModelRow = ({ m, on, onToggle }: { m: Model; on: boolean; onToggle: (v: boolean) => void }) => {
  const id = `m-${m.id}`;
  return (
    <li>
      <label className="hover:bg-muted/30 flex cursor-pointer items-center gap-3 py-2.5 pr-4 pl-12" htmlFor={id}>
        <span className={cn("v3-tone flex min-w-0 flex-1 items-center gap-2", !on && "text-muted-foreground")}>
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

