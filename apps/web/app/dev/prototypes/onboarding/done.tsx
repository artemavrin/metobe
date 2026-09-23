"use client";

// The last onboarding screen, three directions: what you got ("Итог"), start right away ("Сразу в чат"),
// a moment of joy ("Праздник").
import { Button } from "@purr/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@purr/ui/components/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@purr/ui/components/item";
import { Badge } from "@purr/ui/components/reui/badge";
import { FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@purr/ui/components/select";
import { cn } from "@purr/ui/lib/utils";
import { ArrowRight, ArrowUp, ChevronRight, Plug, Plus, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fmtContext, models as nModels, providerBy } from "../_p7/mock";
import { CapIcons, enter, NO_AUTOFILL, ProviderMark, RouteBadge } from "../_p7/shared";
import type { Connected, Onboarding } from "./steps";

export type DoneKind = "summary" | "compose" | "confetti" | "deal" | "hello";

const enabledModels = (o: Onboarding) =>
  o.connected.flatMap((c) => providerBy(c.kind).models.filter((m) => c.models.has(m.id)).map((m) => ({ c, m })));

const routeText = (c: Connected) => (c.route.kind === "proxy" ? `через ${c.route.proxy.title}` : "напрямую");

// --- «Итог» ---------------------------------------------------------------------------------------

const Summary = ({ o }: { o: Onboarding }) => {
  const list = enabledModels(o);
  return (
    <>
      <FrameHeader className="gap-1 pt-4!">
        <FrameTitle className="text-xl">Purr готов к работе</FrameTitle>
        <FrameDescription>
          В чате {nModels(list.length)}. Провайдеров и модели можно поменять в настройках в любой момент.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium">В чате</span>
          <ItemGroup className="gap-0! divide-y rounded-xl border">
            {list.map(({ c, m }, i) => {
              const e = enter(i);
              return (
                <Item className={cn("rounded-none", e.className)} key={`${c.kind}:${m.id}`} size="sm" style={e.style}>
                  <ItemMedia>
                    <ProviderMark kind={c.kind} size="xs" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {m.title}
                      {i === 0 && (
                        <Badge size="sm" variant="primary-light">
                          по умолчанию
                        </Badge>
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      {providerBy(c.kind).title} · {fmtContext(m.context)} · {routeText(c)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              );
            })}
          </ItemGroup>
        </div>
        <Button className="h-10">
          Открыть чат <ArrowRight />
        </Button>
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium">Что дальше</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { description: "Ссылкой или письмом", icon: Users, title: "Пригласить команду" },
              { description: "MCP-серверы и сервисы", icon: Plug, title: "Подключить инструменты" },
            ].map(({ icon: Icon, title, description }) => (
              <Item className="hover:bg-muted/50 cursor-pointer text-left" key={title} render={<button type="button" />} size="sm" variant="outline">
                <ItemMedia>
                  <IconTile size="xs" variant="frame">
                    <Icon />
                  </IconTile>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{title}</ItemTitle>
                  <ItemDescription>{description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRight className="text-muted-foreground size-4" />
                </ItemActions>
              </Item>
            ))}
          </div>
          <Button className="text-muted-foreground w-fit" onClick={() => o.setStep("pick")} size="sm" variant="ghost">
            <Plus /> Подключить ещё провайдера
          </Button>
        </div>
      </FramePanel>
    </>
  );
};

// --- «Сразу в чат» --------------------------------------------------------------------------------

const PROMPTS = ["Что ты умеешь?", "Составь план на неделю", "Объясни простыми словами, что такое MCP"];

const Compose = ({ o }: { o: Onboarding }) => {
  const list = enabledModels(o);
  const [model, setModel] = useState<string>(list[0] ? `${list[0].c.kind}:${list[0].m.id}` : "");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const current = list.find(({ c, m }) => `${c.kind}:${m.id}` === model);

  if (sent) {
    return (
      <FrameHeader className="animate-in fade-in fill-mode-both gap-3 py-10! text-center duration-200 ease-out">
        <FrameTitle className="text-xl">Открываем чат…</FrameTitle>
        <FrameDescription>
          {current?.m.title} уже отвечает на «{text}»
        </FrameDescription>
      </FrameHeader>
    );
  }

  return (
    <>
      <FrameHeader className="gap-1 pt-4!">
        <FrameTitle className="text-xl">Можно начинать</FrameTitle>
        <FrameDescription>
          Подключено: {o.connected.map((c) => providerBy(c.kind).title).join(", ")} — {nModels(list.length)}. Спросите что-нибудь.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) setSent(true);
          }}
        >
          <InputGroup>
            <InputGroupTextarea
              {...NO_AUTOFILL}
              autoFocus
              className="min-h-24 text-base md:text-sm"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) setSent(true);
                }
              }}
              placeholder="Спросите что-нибудь…"
              value={text}
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <Select onValueChange={(v) => setModel(String(v))} value={model}>
                <SelectTrigger className="h-7 border-0 bg-transparent! px-2 shadow-none" size="sm">
                  <SelectValue>
                    {current && (
                      <span className="flex items-center gap-1.5">
                        <ProviderMark kind={current.c.kind} size="xs" /> {current.m.title}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {list.map(({ c, m }) => (
                    <SelectItem key={`${c.kind}:${m.id}`} value={`${c.kind}:${m.id}`}>
                      {m.title}
                      <span className="text-muted-foreground text-xs">{providerBy(c.kind).title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* aria-disabled, not disabled: InputGroup dims the whole group when any control inside is disabled */}
              <InputGroupButton
                aria-disabled={!text.trim()}
                aria-label="Отправить"
                className="rounded-full aria-disabled:opacity-40"
                size="icon-xs"
                type="submit"
                variant="default"
              >
                <ArrowUp />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <div className="flex flex-wrap gap-2">
          {PROMPTS.map((p, i) => {
            const e = enter(i + 1);
            return (
              <Button className={cn("rounded-full", e.className)} key={p} onClick={() => setText(p)} size="sm" style={e.style} variant="outline">
                {p}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="flex flex-wrap items-center gap-1.5">
            {o.connected.map((c) => (
              <RouteBadge key={c.kind} route={c.route} />
            ))}
          </span>
          <Button className="text-muted-foreground" onClick={() => o.setStep("pick")} size="sm" variant="ghost">
            <Plus /> Ещё провайдер
          </Button>
        </div>
      </FramePanel>
    </>
  );
};

// --- «Праздник»: three takes ---------------------------------------------------------------------

const modelNames = (o: Onboarding) => {
  const names = enabledModels(o).map(({ m }) => m.title);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} и ${names.at(-1)}` : (names[0] ?? "");
};

const Actions = ({ o, primary = "Открыть чат" }: { o: Onboarding; primary?: string }) => (
  <div className="flex flex-col gap-2">
    <Button className="h-10">
      {primary} <ArrowRight />
    </Button>
    <Button className="text-muted-foreground w-fit self-center" onClick={() => o.setStep("pick")} size="sm" variant="ghost">
      <Plus /> Подключить ещё провайдера
    </Button>
  </div>
);

const REDUCED = "@media (prefers-reduced-motion: reduce) { .celebrate *, .celebrate { animation: none !important } .celebrate .confetti { display: none } }";

// «Конфетти»: a restrained burst in the theme colors, once, from behind the headline.
const CONFETTI_CSS = `
@keyframes confetti-fly {
  0% { transform: translate(0, 0) rotate(0) scale(0.6); opacity: 1 }
  45% { transform: translate(calc(var(--dx) * 0.8), var(--up)) rotate(calc(var(--r) * 0.6)) scale(1); opacity: 1 }
  100% { transform: translate(var(--dx), var(--down)) rotate(var(--r)) scale(0.9); opacity: 0 }
}
@keyframes title-in { from { transform: translateY(8px) scale(0.96); opacity: 0 } to { transform: none; opacity: 1 } }
${REDUCED}`;

const CONFETTI_COLORS = ["var(--primary)", "var(--chart-1)", "var(--success)", "var(--warning)", "var(--info)", "var(--chart-3)"];

const Confetti = () => {
  // Deterministic spread so the burst looks the same on every replay; rounded so server and client agree.
  const pieces = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const a = (i / 34) * Math.PI * 2 + (i % 3) * 0.35;
        const dist = 120 + ((i * 53) % 110);
        return {
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          delay: (i % 5) * 18,
          down: `${40 + ((i * 37) % 90)}px`,
          dx: `${Math.round(Math.cos(a) * dist)}px`,
          r: `${(i % 2 ? 1 : -1) * (180 + ((i * 29) % 360))}deg`,
          round: i % 4 === 0,
          up: `${Math.round(-Math.abs(Math.sin(a)) * dist * 0.7 - 30)}px`,
        };
      }),
    []
  );
  return (
    <span aria-hidden className="confetti pointer-events-none absolute top-1/2 left-1/2">
      {pieces.map((p, i) => (
        <span
          className={cn("absolute block", p.round ? "size-1.5 rounded-full" : "h-2.5 w-1 rounded-[1px]")}
          key={i}
          style={
            {
              "--down": p.down,
              "--dx": p.dx,
              "--r": p.r,
              "--up": p.up,
              animation: `confetti-fly 1100ms cubic-bezier(0.23, 1, 0.32, 1) ${p.delay}ms both`,
              background: p.color,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
};

const CelebrateConfetti = ({ o }: { o: Onboarding }) => (
  <>
    <style>{CONFETTI_CSS}</style>
    <FrameHeader className="celebrate relative items-center gap-2 pt-10! pb-6! text-center">
      <Confetti />
      <FrameTitle className="text-3xl tracking-tight" style={{ animation: "title-in 450ms cubic-bezier(0.23,1,0.32,1) 80ms both" }}>
        Purr готов
      </FrameTitle>
      <FrameDescription className="max-w-sm" style={{ animation: "title-in 450ms cubic-bezier(0.23,1,0.32,1) 180ms both" }}>
        {modelNames(o)} ждут первого вопроса. Всё остальное — в настройках, когда понадобится.
      </FrameDescription>
    </FrameHeader>
    <FramePanel className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both delay-300 duration-300 ease-out">
      <Actions o={o} />
    </FramePanel>
  </>
);

// «Раздача»: the connected models are dealt onto the table one by one, each clicks into place.
const DEAL_CSS = `
@keyframes deal-in { 0% { transform: translateY(40px) rotate(var(--tilt)) scale(0.96); opacity: 0 } 70% { opacity: 1 } 100% { transform: none; opacity: 1 } }
@keyframes tick-pop { 0% { transform: scale(0) } 70% { transform: scale(1.2) } 100% { transform: scale(1) } }
${REDUCED}`;

const CelebrateDeal = ({ o }: { o: Onboarding }) => {
  const list = enabledModels(o);
  const step = 140;
  const after = 200 + list.length * step;
  return (
    <>
      <style>{DEAL_CSS}</style>
      <FrameHeader className="gap-1 pt-4!">
        <FrameTitle className="text-xl">Готово — вот ваши модели</FrameTitle>
        <FrameDescription>Они уже в чате. Первая будет выбрана по умолчанию.</FrameDescription>
      </FrameHeader>
      <FramePanel className="celebrate flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          {list.map(({ c, m }, i) => (
            <div
              className="bg-background flex items-center gap-3 rounded-xl border px-3 py-2.5 shadow-xs"
              key={`${c.kind}:${m.id}`}
              style={
                {
                  "--tilt": `${i % 2 ? 3 : -3}deg`,
                  animation: `deal-in 420ms cubic-bezier(0.23, 1, 0.32, 1) ${200 + i * step}ms both`,
                } as React.CSSProperties
              }
            >
              <ProviderMark kind={c.kind} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {m.title}
                  {i === 0 && (
                    <Badge size="sm" variant="primary-light">
                      по умолчанию
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {providerBy(c.kind).title} · {fmtContext(m.context)} · {routeText(c)}
                </span>
              </div>
              <CapIcons caps={m.caps} />
              <span
                className="bg-success flex size-5 items-center justify-center rounded-full text-white"
                style={{ animation: `tick-pop 300ms cubic-bezier(0.23, 1, 0.32, 1) ${200 + i * step + 320}ms both` }}
              >
                <svg aria-hidden className="size-3" fill="none" viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                </svg>
              </span>
            </div>
          ))}
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out" style={{ animationDelay: `${after}ms` }}>
          <Actions o={o} />
        </div>
      </FramePanel>
    </>
  );
};

// «Привет»: the model itself greets you — the first answer is the celebration.
const useTyping = (text: string, speed = 16) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    setN(0);
    const start = setTimeout(() => {
      const t = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(t), v) : v + 1)), speed);
    }, 350);
    return () => clearTimeout(start);
  }, [text, speed]);
  return { done: n >= text.length, shown: text.slice(0, n) };
};

const CelebrateHello = ({ o }: { o: Onboarding }) => {
  const first = enabledModels(o)[0];
  const route = first ? routeText(first.c) : "";
  const text = first
    ? `Привет! Я ${first.m.title}, подключён ${route}. Настройка закончена — можно спрашивать что угодно: помогу с текстами, кодом, таблицами и идеями. С чего начнём?`
    : "";
  const { shown, done } = useTyping(text);
  return (
    <>
      <FrameHeader className="gap-1 pt-4!">
        <FrameTitle className="text-xl">Готово! Модель уже на связи</FrameTitle>
        <FrameDescription>Это ответ настоящей модели через ваш ключ — значит, всё работает.</FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        {first && (
          <div className="flex items-start gap-3">
            <ProviderMark kind={first.c.kind} size="sm" />
            <div className="bg-muted/60 min-h-[76px] flex-1 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed">
              {shown}
              {!done && <span className="bg-foreground/70 ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse" />}
            </div>
          </div>
        )}
        <div className={cn("flex flex-wrap gap-2 pl-11 transition-opacity duration-300 ease-out", done ? "opacity-100" : "pointer-events-none opacity-0")}>
          {PROMPTS.map((p) => (
            <Button className="rounded-full" key={p} size="sm" variant="outline">
              {p}
            </Button>
          ))}
        </div>
        <Actions o={o} primary="Продолжить в чате" />
      </FramePanel>
    </>
  );
};

export const DoneScreen = ({ kind, o }: { kind: DoneKind; o: Onboarding }) => {
  switch (kind) {
    case "summary":
      return <Summary o={o} />;
    case "compose":
      return <Compose o={o} />;
    case "confetti":
      return <CelebrateConfetti o={o} />;
    case "deal":
      return <CelebrateDeal o={o} />;
    case "hello":
      return <CelebrateHello o={o} />;
  }
};
