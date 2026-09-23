"use client";

// The last onboarding screen, three directions: what you got ("Итог"), start right away ("Сразу в чат"),
// a moment of joy ("Праздник").
import { Button } from "@purr/ui/components/button";
import { Confetti, type ConfettiRef } from "@purr/ui/components/confetti";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@purr/ui/components/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@purr/ui/components/item";
import { Badge } from "@purr/ui/components/reui/badge";
import { FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@purr/ui/components/reui/frame";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@purr/ui/components/select";
import { cn } from "@purr/ui/lib/utils";
import { ArrowRight, ArrowUp, ChevronRight, Plug, Plus, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { byNewest, fmtContext, models as nModels, providerBy } from "../_p7/mock";
import { CapIcons, enter, NO_AUTOFILL, ProviderMark, RouteBadge } from "../_p7/shared";
import type { Connected, Onboarding } from "./steps";

export type DoneKind = "summary" | "compose" | "burst" | "cannons" | "fireworks" | "stars" | "deal" | "hello";

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

/** Who is waiting in chat: up to three names, otherwise the two newest and the rest as a count. */
const modelNames = (o: Onboarding) => {
  const names = enabledModels(o)
    .map(({ m }) => m)
    .sort(byNewest)
    .map((m) => m.title);
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(", ")} и ${names.at(-1)}` : (names[0] ?? "");
  return `${names[0]}, ${names[1]} и ещё ${nModels(names.length - 2)}`;
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

// «Конфетти» on Magic UI Confetti (canvas-confetti): real particle physics — drag, gravity, flutter.
// Presets follow the Magic UI examples, aimed at the card and painted in the theme colors.
const TITLE_CSS = `@keyframes title-in { from { transform: translateY(8px) scale(0.96); opacity: 0 } to { transform: none; opacity: 1 } }
${REDUCED}`;

type ConfettiMode = "burst" | "cannons" | "fireworks" | "stars";

/** canvas-confetti wants hex; the theme speaks oklch. Let the browser convert through a 1px canvas. */
const themeColors = (vars: string[]) => {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const styles = getComputedStyle(document.documentElement);
  return vars.map((v) => {
    if (!ctx) return "#3b82f6";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = styles.getPropertyValue(v).trim() || "#3b82f6";
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`;
  });
};

/** Where the headline is, in viewport fractions — canvas-confetti's `origin`. */
const originOf = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  if (!r) return { x: 0.5, y: 0.3 };
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
};

const useCelebration = (
  mode: ConfettiMode,
  target: React.RefObject<HTMLElement | null>,
  confetti: React.RefObject<ConfettiRef | null>,
  ready: boolean
) => {
  useEffect(() => {
    if (!ready) return;
    const fire = (o: Parameters<ConfettiRef["fire"]>[0]) =>
      confetti.current?.fire({ disableForReducedMotion: true, ...o });
    const colors = themeColors(["--primary", "--chart-1", "--success", "--warning", "--info", "--chart-3"]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    const start = setTimeout(() => {
      const origin = originOf(target.current);
      if (mode === "burst") {
        fire({ colors, decay: 0.92, gravity: 0.7, origin, particleCount: 110, scalar: 0.9, spread: 75, startVelocity: 38, ticks: 320 });
        timers.push(setTimeout(() => fire({ colors, decay: 0.93, gravity: 0.6, origin, particleCount: 40, scalar: 0.8, spread: 120, startVelocity: 25, ticks: 300 }), 180));
      }
      if (mode === "cannons") {
        const end = Date.now() + 1400;
        const frame = () => {
          fire({ angle: 60, colors, origin: { x: 0, y: 0.6 }, particleCount: 3, spread: 55, startVelocity: 60, ticks: 260 });
          fire({ angle: 120, colors, origin: { x: 1, y: 0.6 }, particleCount: 3, spread: 55, startVelocity: 60, ticks: 260 });
          if (Date.now() < end) raf = requestAnimationFrame(frame);
        };
        frame();
      }
      if (mode === "fireworks") {
        const card = target.current?.closest('[data-slot="frame"]')?.getBoundingClientRect();
        const box = card
          ? { bottom: card.bottom / window.innerHeight, left: card.left / window.innerWidth, right: card.right / window.innerWidth, top: card.top / window.innerHeight }
          : { bottom: 0.6, left: 0.3, right: 0.7, top: 0.1 };
        const shots = [
          { x: box.left, y: box.top + 0.05 },
          { x: box.right, y: box.top + 0.12 },
          { x: (box.left + box.right) / 2, y: box.top - 0.02 },
          { x: box.left + 0.04, y: box.bottom - 0.1 },
          { x: box.right - 0.04, y: box.bottom - 0.05 },
        ];
        shots.forEach((pos, i) =>
          timers.push(setTimeout(() => fire({ colors, decay: 0.91, gravity: 0.8, origin: pos, particleCount: 45, spread: 360, startVelocity: 26, ticks: 90 }), i * 260))
        );
      }
      if (mode === "stars") {
        const gold = ["#FFE400", "#FFBD00", "#E89400", "#FFCA6C", "#FDFFB8"];
        const star = { colors: [...gold, colors[0] as string], decay: 0.94, gravity: 0, origin, spread: 360, startVelocity: 26, ticks: 70 };
        const shoot = () => {
          fire({ ...star, particleCount: 36, scalar: 1.2, shapes: ["star"] });
          fire({ ...star, particleCount: 12, scalar: 0.75, shapes: ["circle"] });
        };
        [0, 110, 220].forEach((d) => timers.push(setTimeout(shoot, d)));
      }
    }, 260);
    return () => {
      clearTimeout(start);
      for (const t of timers) clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [mode, target, confetti, ready]);
};

const CelebrateConfetti = ({ o, mode }: { o: Onboarding; mode: ConfettiMode }) => {
  const title = useRef<HTMLDivElement>(null);
  const confetti = useRef<ConfettiRef>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useCelebration(mode, title, confetti, mounted);
  return (
    <>
      <style>{TITLE_CSS}</style>
      {/* One full-viewport canvas, portaled to <body>: the card's entrance transform would otherwise make
          `fixed` relative to the card and clip the confetti. No worker, so React's dev double-mount can re-create it. */}
      {mounted &&
        createPortal(
          <Confetti className="pointer-events-none fixed inset-0 z-50 size-full" globalOptions={{ resize: true, useWorker: false }} manualstart ref={confetti} />,
          document.body
        )}
      <FrameHeader className="celebrate items-center gap-2 pt-10! pb-6! text-center">
        <FrameTitle className="text-3xl tracking-tight" ref={title} style={{ animation: "title-in 450ms cubic-bezier(0.23,1,0.32,1) 80ms both" }}>
          Purr готов
        </FrameTitle>
        <FrameDescription className="max-w-sm" style={{ animation: "title-in 450ms cubic-bezier(0.23,1,0.32,1) 180ms both" }}>
          {modelNames(o)} {enabledModels(o).length === 1 ? "ждёт" : "ждут"} первого вопроса. Всё остальное — в настройках, когда понадобится.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both delay-300 duration-300 ease-out">
        <Actions o={o} />
      </FramePanel>
    </>
  );
};

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
    case "burst":
    case "cannons":
    case "fireworks":
    case "stars":
      return <CelebrateConfetti mode={kind} o={o} />;
    case "deal":
      return <CelebrateDeal o={o} />;
    case "hello":
      return <CelebrateHello o={o} />;
  }
};
