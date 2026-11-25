"use client";

import { Avatar, AvatarFallback } from "@metobe/ui/components/avatar";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight, Gauge, LogOut, Plug, Settings, UserRound } from "lucide-react";

import { Row, Rows, Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import { ChatShell, usePhone } from "../privacy/frame";
import { WEEK_DAYS, resetWord, tone } from "./data";
import { Bars, LimitBar, Ring, TierBadge, topPct, useLimits } from "./parts";
import { SettingsWindow } from "./window";

// «Лимиты» вместо «Расходов» (ORGS-PLAN §7.6, §8): полосы с процентом и сбросом, история недели в процентах и
// запросах — без денег. «Строки» — как другие экраны настроек; «Плитки» — два больших кольца и столбики по дням;
// «Меню» — полосы прямо в меню аккаунта, страница — та же, что в «Строках».

const GROUPS = [{ items: ["Аккаунт", "Подключения", "Лимиты", "Файлы", "Мои скиллы"], title: "Моё" }];
const DESCRIPTION = "Сколько лимита своего места вы использовали. Лимит на 5 часов отсчитывается от первого запроса, недельный — с понедельника 00:00.";

const requests = (n: number) => {
  const d = n % 10;
  const dd = n % 100;
  const w = d === 1 && dd !== 11 ? "запрос" : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? "запроса" : "запросов";
  return `${n} ${w}`;
};

const Week = () => (
  <Section meta={requests(WEEK_DAYS.reduce((s, d) => s + d.requests, 0))} title="Эта неделя">
    <Rows>
      {WEEK_DAYS.filter((d) => d.requests > 0).map((d) => (
        <Row hint={requests(d.requests)} key={d.day} label={d.day === "пн" ? "Понедельник" : d.day === "вт" ? "Вторник" : d.day === "ср" ? "Среда" : "Четверг"}>
          <span className="tabular-nums">{d.pct} % недели</span>
        </Row>
      ))}
    </Rows>
  </Section>
);

const PlainPage = () => {
  const { limits, tier } = useLimits();
  return (
    <SettingsPageFrame>
      <SettingsHeader description={DESCRIPTION} title="Лимиты" />
      <Rows>
        <Row hint="Тариф места назначает владелец организации" label="Место">
          <TierBadge tier={tier} />
        </Row>
        {limits.five && (
          <div className="px-4 py-3">
            <LimitBar label="5 часов" pct={limits.five.pct} reset={limits.five.reset} />
          </div>
        )}
        <div className="px-4 py-3">
          <LimitBar label="Неделя" pct={limits.week.pct} reset={limits.week.reset} />
        </div>
      </Rows>
      <Week />
    </SettingsPageFrame>
  );
};

export const PageRows = () => (
  <SettingsWindow active="Лимиты" groups={GROUPS}>
    <PlainPage />
  </SettingsWindow>
);

// ── Плитки ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const Tile = ({ label, pct, reset }: { label: string; pct: number; reset: string | null }) => {
  const t = tone(pct);
  return (
    <div className="flex items-center gap-4 rounded-xl border p-4">
      <Ring pct={pct} size={56} />
      <div className="flex min-w-0 flex-col">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className={cn("text-2xl font-semibold tabular-nums", t === "out" && "text-destructive", t === "warn" && "text-amber-700 dark:text-amber-400")}>{pct} %</span>
        <span className="text-muted-foreground text-xs">{pct >= 100 ? `Исчерпан, ${resetWord(reset)}` : resetWord(reset).replace(/^с/u, "С")}</span>
      </div>
    </div>
  );
};

export const PageTiles = () => {
  const { limits, tier } = useLimits();
  const max = Math.max(...WEEK_DAYS.map((d) => d.pct), 1);
  return (
    <SettingsWindow active="Лимиты" groups={GROUPS}>
      <SettingsPageFrame>
        <div className="flex items-start justify-between gap-3">
          <SettingsHeader description={DESCRIPTION} title="Лимиты" />
          <TierBadge tier={tier} />
        </div>
        <div className="grid gap-3 @md:grid-cols-2">
          {limits.five && <Tile label="5 часов" pct={limits.five.pct} reset={limits.five.reset} />}
          <Tile label="Неделя" pct={limits.week.pct} reset={limits.week.reset} />
        </div>
        <Section meta={`${requests(WEEK_DAYS.reduce((s, d) => s + d.requests, 0))}, ${limits.week.pct} % недели`} title="По дням">
          <div className="grid h-40 grid-cols-7 items-end gap-2 rounded-xl border p-4 pb-2">
            {WEEK_DAYS.map((d) => (
              <div className="flex h-full flex-col items-center justify-end gap-1.5" key={d.day} title={`${d.pct} % недели · ${requests(d.requests)}`}>
                <span className="text-muted-foreground text-[11px] tabular-nums">{d.requests > 0 ? `${d.pct} %` : ""}</span>
                <div className="bg-primary/80 w-full max-w-8 rounded-t-md" style={{ height: `${(d.pct / max) * 70}%`, minHeight: d.requests > 0 ? 4 : 1 }} />
                <span className="text-muted-foreground text-xs">{d.day}</span>
              </div>
            ))}
          </div>
        </Section>
      </SettingsPageFrame>
    </SettingsWindow>
  );
};

// ── Меню аккаунта ────────────────────────────────────────────────────────────────────────────────────────────────────

const MenuItem = ({ icon: Icon, children }: { icon: typeof Gauge; children: React.ReactNode }) => (
  <span className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
    <Icon className="text-muted-foreground size-4" />
    <span className="flex-1">{children}</span>
  </span>
);

const AccountMenu = () => {
  const { limits, tier } = useLimits();
  return (
    <div className="bg-popover text-popover-foreground ring-foreground/10 flex w-72 flex-col gap-1 rounded-xl p-1.5 shadow-lg ring-1">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Avatar className="size-8">
          <AvatarFallback>АБ</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">Анна Белова</span>
          <span className="text-muted-foreground truncate text-xs">Северный ветер</span>
        </div>
        <TierBadge tier={tier} />
      </div>
      <div className="bg-border mx-1 my-1 h-px" />
      {/* Полосы — прямо в меню; нажатие ведёт на «Лимиты». */}
      <span className="hover:bg-accent flex flex-col gap-2.5 rounded-md px-2 py-2">
        <span className="flex items-center gap-2 text-sm">
          <Gauge className="text-muted-foreground size-4" />
          <span className="flex-1">Лимиты</span>
          <ChevronRight className="text-muted-foreground size-3.5" />
        </span>
        <span className="pl-6">
          <Bars dense limits={limits} />
        </span>
      </span>
      <div className="bg-border mx-1 my-1 h-px" />
      <MenuItem icon={UserRound}>Аккаунт</MenuItem>
      <MenuItem icon={Plug}>Подключения</MenuItem>
      <MenuItem icon={Settings}>Настройки</MenuItem>
      <MenuItem icon={LogOut}>Выйти</MenuItem>
    </div>
  );
};

export const PageMenu = () => {
  const phone = usePhone();
  const { limits } = useLimits();
  if (phone) {
    return (
      <ChatShell>
        <div className="flex flex-1 flex-col justify-end">
          <AccountMenu />
        </div>
      </ChatShell>
    );
  }
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground relative flex w-60 shrink-0 flex-col border-r p-2 text-sm">
        <div className="flex-1" />
        <div className="absolute bottom-14 left-2 z-10">
          <AccountMenu />
        </div>
        <span className="bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5">
          <Avatar className="size-6">
            <AvatarFallback className="text-[10px]">АБ</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate">Анна Белова</span>
          <Ring pct={topPct(limits)} size={16} />
        </span>
      </aside>
      <main className="min-w-0 flex-1" />
    </div>
  );
};
