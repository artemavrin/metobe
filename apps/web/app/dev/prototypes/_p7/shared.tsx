"use client";

import { Badge } from "@purr/ui/components/reui/badge";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@purr/ui/components/tooltip";
import { cn } from "@purr/ui/lib/utils";
import { Braces, Brain, Eye, Globe, Route, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { type Caps, PROXIES, type ProviderKind, type ProviderSpec, type Proxy } from "./mock";

// --- connection check simulation ------------------------------------------------------------------

/** `blocked` — direct failed and no proxy is configured yet: the user supplies one. */
export type Phase = "idle" | "direct" | "probing" | "proxyFound" | "blocked" | "models" | "done" | "error";
export type RouteChoice = { kind: "direct" } | { kind: "proxy"; proxy: Proxy };
export type CheckError = { title: string; hint: string; field?: "key" | "extra" | "proxy" };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PROXY_URL = /^(https?|socks5h?):\/\/(?:[^@/\s]+@)?([^:/\s]+)(?::(\d+))?\/?$/;

/**
 * Walks the same path the real check will: direct → known proxies on network/geo failure → models.
 * With no proxies configured (a fresh install) a blocked provider stops at `blocked` and asks for one.
 */
export const useConnection = (spec: ProviderSpec, proxies: Proxy[] = PROXIES) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [route, setRoute] = useState<RouteChoice>({ kind: "direct" });
  const [error, setError] = useState<CheckError | null>(null);
  const run = useRef(0);

  useEffect(() => () => void run.current++, []);

  const reset = useCallback(() => {
    run.current++;
    setPhase("idle");
    setError(null);
    setRoute({ kind: "direct" });
  }, []);

  const fail = (e: CheckError) => {
    setError(e);
    setPhase("error");
  };

  const start = useCallback(
    async (key: string, extra = "") => {
      const id = ++run.current;
      const alive = () => run.current === id;
      setError(null);
      if (spec.extraField && !extra.trim()) {
        return fail({ field: "extra", hint: spec.extraField.hint, title: `Нужен ${spec.extraField.label.toLowerCase()}` });
      }
      if (!spec.keyOptional && !key.trim()) {
        return fail({ field: "key", hint: `Ключ выглядит как ${spec.keyPlaceholder}`, title: "Вставьте ключ" });
      }
      setPhase("direct");
      await wait(900);
      if (!alive()) return;
      const looksWrong = key.includes("bad") || (!spec.keyOptional && !spec.keyPrefix.test(key.trim()));
      if (looksWrong) {
        return fail({
          field: "key",
          hint: `${spec.title} ответил 401. Проверьте, что ключ скопирован целиком и не отозван.`,
          title: "Ключ не подошёл",
        });
      }
      if (spec.directBlocked) {
        if (!proxies.length) {
          setPhase("blocked");
          return;
        }
        setPhase("probing");
        await wait(1100);
        if (!alive()) return;
        setRoute({ kind: "proxy", proxy: proxies[0] as Proxy });
        setPhase("proxyFound");
        return;
      }
      setPhase("models");
      await wait(800);
      if (alive()) setPhase("done");
    },
    [spec, proxies]
  );

  /** A proxy typed in by the user: checked, then saved as the first proxy record. */
  const tryProxy = useCallback(
    async (url: string) => {
      const match = PROXY_URL.exec(url.trim());
      if (!match) {
        setError({ field: "proxy", hint: "Например http://user:pass@10.0.0.5:3128 или socks5://proxy.local:1080", title: "Не похоже на адрес прокси" });
        return;
      }
      const id = ++run.current;
      setError(null);
      setPhase("probing");
      await wait(1100);
      if (run.current !== id) return;
      if (url.includes("bad")) {
        setError({ field: "proxy", hint: "Проверьте адрес и порт: прокси не принял соединение за 10 секунд.", title: "Прокси не отвечает" });
        setPhase("blocked");
        return;
      }
      const type = match[1]?.startsWith("socks") ? "socks5" : "http";
      setRoute({ kind: "proxy", proxy: { country: "DE", id: "new", latency: 52, title: match[2] ?? "прокси", type } });
      setPhase("models");
      await wait(800);
      if (run.current === id) setPhase("done");
    },
    []
  );

  const acceptProxy = useCallback(async () => {
    const id = ++run.current;
    setPhase("models");
    await wait(800);
    if (run.current === id) setPhase("done");
  }, []);

  const declineProxy = useCallback(() => {
    run.current++;
    fail({
      hint: "Из этой сети он отвечает гео-блоком. Добавьте прокси в настройках или подключите AI Gateway — он доступен напрямую.",
      title: `${spec.title} напрямую недоступен`,
    });
  }, [spec]);

  return { acceptProxy, declineProxy, error, phase, reset, route, start, tryProxy };
};

export const busy = (p: Phase) => p === "direct" || p === "probing" || p === "models" || p === "proxyFound";

// --- visuals on ReUI ------------------------------------------------------------------------------

const MARKS: Record<ProviderKind, { glyph: string; className: string }> = {
  anthropic: { className: "bg-[#d97757] text-white", glyph: "A" },
  compatible: { className: "bg-muted text-foreground", glyph: "{ }" },
  gateway: { className: "bg-foreground text-background", glyph: "▲" },
  openai: { className: "bg-[#0f0f0f] text-white dark:bg-white dark:text-black", glyph: "O" },
  yandex: { className: "bg-[#fc3f1d] text-white", glyph: "Я" },
};

/** Provider identity: a ReUI IconTile with a letter mark (no brand logos). */
export const ProviderMark = ({ kind, size = "sm" }: { kind: ProviderKind; size?: "xs" | "sm" | "default" | "lg" | "xl" }) => {
  const m = MARKS[kind];
  return (
    <IconTile aria-hidden className={cn("font-semibold tracking-tight", m.className)} size={size} variant="solid">
      <span className={cn(size === "xs" ? "text-[10px]" : size === "lg" || size === "xl" ? "text-lg" : "text-sm")}>{m.glyph}</span>
    </IconTile>
  );
};

const CAP_META = [
  { icon: Wrench, key: "tools", label: "Инструменты" },
  { icon: Eye, key: "vision", label: "Картинки на входе" },
  { icon: Brain, key: "reasoning", label: "Рассуждение" },
  { icon: Braces, key: "structured", label: "Структурированный ответ" },
] as const;

export const CapIcons = ({ caps }: { caps: Caps }) => (
  <span className="inline-flex items-center gap-0.5">
    {CAP_META.map(({ key, icon: Icon, label }) => {
      const v = caps[key];
      return (
        <Tooltip key={key}>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md",
                  v === true && "text-foreground/80",
                  v === false && "text-muted-foreground/30",
                  v === null && "text-muted-foreground/70 outline-1 -outline-offset-4 outline-dashed outline-muted-foreground/40"
                )}
              />
            }
          >
            <Icon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            {label}: {v === null ? "не проверено — попробуем, при ошибке отключим" : v ? "да" : "нет"}
          </TooltipContent>
        </Tooltip>
      );
    })}
  </span>
);

export const RouteBadge = ({ route }: { route: RouteChoice }) =>
  route.kind === "direct" ? (
    <Badge size="sm" variant="outline">
      <Globe /> напрямую
    </Badge>
  ) : (
    <Badge size="sm" variant="info-light">
      <Route /> {route.proxy.title} · {route.proxy.country}
    </Badge>
  );

/** Staggered entrance for freshly discovered rows. */
export const enter = (i: number) => ({
  className: "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 ease-out motion-reduce:animate-none",
  style: { animationDelay: `${Math.min(i, 12) * 35}ms` },
});
