"use client";

// «Прокси» (ARCH §18): ways out to the internet, set up once and used where needed. Same list → detail as sources:
// the check is an object (external IP, country, latency), and «what goes through me» edits the same field the
// source's «Маршрут» shows — sources ticked explicitly, plus domains for everything on «Авто».
import { SettingsPageFrame } from "../../app-shell/shell-modes";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metobe/ui/components/dialog";
import { Input } from "@metobe/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Switch } from "@metobe/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Network, Plus, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";

import { BrandLogo } from "../../_p7/brand";
import { providerBy } from "../../_p7/mock";
import { NO_AUTOFILL } from "../../_p7/shared";
import { Sparkline } from "../panel/common";
import { EditRow, LIST_PANEL, ListRow, Row, Section, useListHighlight } from "./parts";
import { COUNTRY, type ProxyEntry, type ProxyType, type Settings, SOURCE_HOST } from "./state";

const TYPES: { id: ProxyType; label: string; hint: string }[] = [
  { hint: "Обычный корпоративный прокси", id: "http", label: "HTTP" },
  { hint: "Соединение с самим прокси зашифровано", id: "https", label: "HTTPS" },
  { hint: "DNS разрешается у нас", id: "socks5", label: "SOCKS5" },
  { hint: "DNS разрешается на стороне прокси — когда блокируют и DNS", id: "socks5h", label: "SOCKS5h" },
];

export const proxyStatus = (x: ProxyEntry) => {
  const h = x.health;
  if (h.state === "ok") return { dot: "bg-success", text: `${COUNTRY[h.country]?.name ?? h.country} · ${h.latency} мс`, tone: "muted" as const };
  if (h.state === "error") return { dot: "bg-destructive", text: "Не отвечает", tone: "error" as const };
  if (h.state === "checking") return { dot: "bg-warning animate-pulse", text: "Проверяем…", tone: "muted" as const };
  return { dot: "bg-muted-foreground/40", text: "Не проверен", tone: "muted" as const };
};

/** Country flag on a tile; a network glyph until the first check tells where the proxy exits. */
export const ProxyMark = ({ x, size = 32, pop = false }: { x: ProxyEntry; size?: number; pop?: boolean }) => (
  <span
    className="bg-background inline-flex shrink-0 items-center justify-center rounded-[28%] shadow-[0_0_0_1px_rgba(0,0,0,0.07),0_1px_2px_-1px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
    style={{ fontSize: size * 0.55, height: size, width: size }}
  >
    {x.health.state === "ok" && COUNTRY[x.health.country] ? (
      <span className={pop ? "v3-pop" : undefined}>{COUNTRY[x.health.country]?.flag}</span>
    ) : (
      <Network className="text-muted-foreground" style={{ height: size * 0.5, width: size * 0.5 }} />
    )}
  </span>
);

export const ProxiesPage = ({ s }: { s: Settings }) => {
  const current = s.currentProxy;
  const setSelected = s.setSelectedProxy;
  const list = useListHighlight(current?.id, s.proxies.length);
  return (
    <div className="flex h-full min-h-0 text-sm">
      <aside className={LIST_PANEL}>
        <div className="flex items-start justify-between gap-2 px-5 pt-6 pb-3">
          <div>
            <h1 className="text-base font-semibold">Прокси</h1>
            <p className="text-muted-foreground text-xs">По умолчанию всё идёт напрямую. Через прокси — только то, что отмечено.</p>
          </div>
          <Tooltip>
            <TooltipTrigger render={<Button aria-label="Добавить прокси" onClick={() => setSelected(s.addProxy())} size="icon-sm" variant="outline" />}>
              <Plus />
            </TooltipTrigger>
            <TooltipContent>Добавить прокси</TooltipContent>
          </Tooltip>
        </div>
        <nav className="relative flex flex-col gap-0.5 px-2 pb-4" ref={list.ref}>
          {list.highlight}
          {s.proxies.map((x) => {
            const st = proxyStatus(x);
            return (
              <ListRow
                active={x.id === current?.id}
                key={x.id}
                media={<ProxyMark x={x} />}
                onClick={() => setSelected(x.id)}
                sub={
                  <span className={cn("flex items-center gap-1.5", st.tone === "error" && "text-destructive")}>
                    <span className={cn("v3-dot size-1.5 shrink-0 rounded-full", st.dot)} />
                    {TYPES.find((t) => t.id === x.type)?.label} · {st.text}
                  </span>
                }
                title={x.title}
                trail={
                  <span className="flex -space-x-1">
                    {s.panel.list
                      .filter((p) => s.routeOf(p).proxy?.id === x.id)
                      .map((p) => (
                        <BrandLogo className="ring-background ring-2" key={p.kind} label={s.sourceOf(p.kind).title} logo={s.sourceOf(p.kind).logo} size={20} />
                      ))}
                  </span>
                }
              />
            );
          })}
          {!s.proxies.length && (
            <div className="text-muted-foreground flex flex-col items-center gap-3 px-4 py-10 text-center text-xs">
              <Network className="size-5" />
              Прокси нет — всё идёт напрямую.
            </div>
          )}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {current && (
          <SettingsPageFrame key={current.id}>
            <ProxyDetail onRemoved={() => setSelected(s.proxies.find((x) => x.id !== current.id)?.id ?? null)} s={s} x={current} />
          </SettingsPageFrame>
        )}
      </main>
    </div>
  );
};

const CheckPill = ({ x }: { x: ProxyEntry }) => {
  const h = x.health;
  const st = proxyStatus(x);
  const label =
    h.state === "ok"
      ? `OK · ${h.latency} мс · ${h.checked}`
      : h.state === "error"
        ? "Не отвечает"
        : h.state === "checking"
          ? "Проверяем…"
          : "Ещё не проверен";
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "hover:bg-muted inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
              st.tone === "error" && "border-destructive/30 text-destructive"
            )}
            type="button"
          />
        }
      >
        <span className={cn("v3-dot size-1.5 rounded-full", st.dot)} />
        <span className="v3-appear" key={h.state}>
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        <div className="flex flex-col gap-3 text-sm">
          <span className="font-medium">Последняя проверка</span>
          {h.state === "ok" ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground font-mono">GET ifconfig.co</dt>
              <dd className="tabular-nums">200 · {h.latency} мс</dd>
              <dt className="text-muted-foreground">Внешний IP</dt>
              <dd className="font-mono">{h.ip}</dd>
              <dt className="text-muted-foreground">Страна</dt>
              <dd>
                {COUNTRY[h.country]?.flag} {COUNTRY[h.country]?.name ?? h.country}
              </dd>
            </dl>
          ) : h.state === "error" ? (
            <span className="text-destructive text-xs">{h.message}</span>
          ) : (
            <span className="text-muted-foreground text-xs">Задайте адрес — проверим сразу.</span>
          )}
          <span className="text-muted-foreground text-xs">Запрос идёт через прокси к сервису, который возвращает IP: так видно, откуда на самом деле выходит трафик.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const ProxyDetail = ({ s, x, onRemoved }: { s: Settings; x: ProxyEntry; onRemoved: () => void }) => {
  const [name, setName] = useState(x.title);
  const [domain, setDomain] = useState("");
  // Was it already checked when the page opened? Then the flag is just there; a first check makes it pop in.
  const checkedAtOpen = useRef(x.health.state === "ok");
  const fresh = !x.address;
  const typeInfo = TYPES.find((t) => t.id === x.type);
  const total = x.day.reduce((a, b) => a + b, 0);
  const through = s.panel.list.filter((p) => s.routeOf(p).proxy?.id === x.id);
  const addDomain = () => {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d || x.domains.includes(d)) return;
    s.patchProxy(x.id, (p) => ({ ...p, domains: [...p.domains, d] }));
    setDomain("");
  };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 md:gap-6">
        <div className="flex items-center gap-4">
          <ProxyMark pop={!checkedAtOpen.current} size={48} x={x} />
          <div className="flex flex-col gap-1.5">
            <Input
              {...NO_AUTOFILL}
              aria-label="Название прокси"
              className="hover:border-border focus-visible:border-ring h-auto border-transparent bg-transparent px-1.5 py-0 text-xl font-semibold tracking-tight shadow-none md:text-xl dark:bg-transparent"
              onBlur={() => name.trim() && s.patchProxy(x.id, (p) => ({ ...p, title: name.trim() }))}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              value={name}
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5">
              <CheckPill x={x} />
              {x.health.state === "ok" && <span className="text-muted-foreground font-mono text-xs">выход {x.health.ip}</span>}
            </div>
          </div>
        </div>
        <Button disabled={fresh || x.health.state === "checking"} onClick={() => void s.checkProxy(x.id)} size="sm" variant="outline">
          <RefreshCw className={cn(x.health.state === "checking" && "animate-spin")} /> Проверить
        </Button>
      </header>

      <Section title="Подключение">
        <div className="divide-y rounded-lg border">
          <Row hint={typeInfo?.hint} label="Тип">
            <Select onValueChange={(v) => s.patchProxy(x.id, (p) => ({ ...p, type: v as ProxyType }))} value={x.type}>
              <SelectTrigger className="w-40">
                <SelectValue>{typeInfo?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <EditRow
            check={(v) => (/^[\w.-]+:\d{2,5}$/.test(v) ? null : "Нужен адрес вида host:port — например, proxy.corp.local:3128")}
            hint="Проверим сразу после сохранения"
            key={x.address}
            label="Адрес"
            onSave={(v) => void s.checkProxy(x.id, v)}
            placeholder="proxy.corp.local:3128"
            startOpen={fresh}
            value={x.address}
          />
          <EditRow
            hint="Если прокси просит логин и пароль"
            label="Вход"
            mono={false}
            display={
              x.user ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono">{x.user}</span>
                  <span className="text-muted-foreground font-mono">••••••</span>
                </span>
              ) : (
                <span className="text-muted-foreground">без пароля</span>
              )
            }
            onSave={(v) => s.patchProxy(x.id, (p) => ({ ...p, user: v }))}
            placeholder="Логин"
            value={x.user ?? ""}
          />
        </div>
      </Section>

      <Section meta={through.length ? `${through.length} из ${s.panel.list.length} источников` : "ничего"} title="Что через него ходит">
        <div className="divide-y rounded-lg border">
          {s.panel.list.map((p) => {
            const r = s.routeOf(p);
            const mine = r.proxy?.id === x.id;
            const note = mine
              ? r.why === "domain"
                ? `по домену ${r.domain}`
                : "выбран у источника"
              : r.proxy
                ? `сейчас через «${r.proxy.title}»`
                : p.routeMode === "direct"
                  ? "только напрямую"
                  : "напрямую";
            const id = `via-${x.id}-${p.kind}`;
            return (
              <label className="hover:bg-muted/30 flex cursor-pointer items-center gap-3 px-4 py-2.5" htmlFor={id} key={p.kind}>
                <BrandLogo label={s.sourceOf(p.kind).title} logo={s.sourceOf(p.kind).logo} size={28} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("v3-tone font-medium", !mine && "text-muted-foreground")}>{s.sourceOf(p.kind).title}</span>
                  <span className="text-muted-foreground text-xs">
                    <span className="font-mono">{SOURCE_HOST[p.kind]}</span> · {note}
                  </span>
                </span>
                <Switch
                  checked={mine}
                  disabled={fresh}
                  id={id}
                  onCheckedChange={(v) => s.panel.setRoute(p.kind, v ? x.id : "direct")}
                  size="sm"
                />
              </label>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="font-medium">Домены</span>
              <span className="text-muted-foreground text-xs">Всё на «Авто», что идёт на эти адреса, пойдёт через этот прокси. Домен покрывает поддомены.</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {x.domains.map((d) => (
              <span className="bg-muted inline-flex h-7 items-center gap-1 rounded-md pr-1 pl-2 font-mono text-xs" key={d}>
                {d}
                <button
                  aria-label={`Убрать ${d}`}
                  className="text-muted-foreground hover:text-foreground hover:bg-background rounded p-0.5"
                  onClick={() => s.patchProxy(x.id, (p) => ({ ...p, domains: p.domains.filter((y) => y !== d) }))}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <Input
              {...NO_AUTOFILL}
              className="h-7 w-56 font-mono text-xs md:text-xs"
              disabled={fresh}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addDomain();
              }}
              placeholder="openai.com, Enter"
              value={domain}
            />
          </div>
        </div>
      </Section>

      {!fresh && (
        <Section meta={`${total.toLocaleString("ru")} запросов · ${x.failed} с ошибкой`} title="За сутки">
          <div className="rounded-lg border px-4 py-4">
            <Sparkline bar="flex-1" className="h-12 gap-1" days={x.day} />
            <div className="text-muted-foreground mt-2 flex justify-between text-[11px] tabular-nums">
              <span>24 ч назад</span>
              <span>сейчас</span>
            </div>
          </div>
        </Section>
      )}

      <Section title="Удаление">
        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <span className="flex flex-col">
            <span className="font-medium">Удалить «{x.title}»</span>
            <span className="text-muted-foreground text-xs">
              {through.length ? `${through.map((p) => s.sourceOf(p.kind).title).join(", ")} пойдут напрямую — проверьте, что они доступны из этой сети.` : "Сейчас через него ничего не ходит."}
            </span>
          </span>
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="destructive" />}>Удалить</DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Удалить «{x.title}»?</DialogTitle>
                <DialogDescription>
                  {through.length
                    ? `Через него ходят: ${through.map((p) => s.sourceOf(p.kind).title).join(", ")}. Они пойдут напрямую и могут перестать отвечать.`
                    : "Через него ничего не ходит."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
                <DialogClose
                  render={
                    <Button
                      onClick={() => {
                        s.removeProxy(x.id);
                        onRemoved();
                      }}
                      variant="destructive"
                    />
                  }
                >
                  Удалить
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Section>
    </>
  );
};
