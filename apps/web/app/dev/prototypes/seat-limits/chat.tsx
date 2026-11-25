"use client";

import { Button } from "@metobe/ui/components/button";
import { Frame, FramePanel } from "@metobe/ui/components/reui/frame";
import { Alert, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { cn } from "@metobe/ui/lib/utils";
import { CircleAlert, Clock, Gauge, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useAttachments } from "@/components/chat/attachments";
import { Composer } from "@/components/chat/composer";
import { PickerDataProvider } from "@/components/chat/picker/data";
import type { Favorites, PickerModel } from "@/components/chat/picker/data";

import { ChatShell, UserBubble } from "../privacy/frame";
import { headline, modelsFor, warnText } from "./data";
import type { Limits } from "./data";
import { Bars, LimitsCard, Ring, TierBadge, topPct, useLimits } from "./parts";

// Чат P35: настоящее поле ввода и настоящий выбор модели (в нём «×N к лимиту» вместо цен, старшие тарифы — серыми
// или скрыты). Разное у вариантов — как видно приближение к лимиту и что вместо отправки, когда лимит кончился:
//   «Полоса» — полоса с процентом приклеена к полю сверху; при 100 % поле заменяет карточка с обеими полосами;
//   «Кольцо» — кольцо в поле всегда, по наведению обе полосы; с 80 % — Alert над полем; при 100 % поле серое;
//   «Строка» — одна строка текста над полем только с 80 %, по наведению обе полосы; при 100 % поле остаётся, а отправка кладёт карточку в ленту.

const useFavorites = (initial: string[]): Favorites => {
  const [ids, setIds] = useState(initial);
  return useMemo(
    () => ({
      has: (id: string) => ids.includes(id),
      ids,
      removeMany: (drop: string[]) => setIds(ids.filter((id) => !drop.includes(id))),
      reorder: setIds,
      toggle: (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    }),
    [ids]
  );
};

const Thread = ({ extra }: { extra?: ReactNode }) => (
  <>
    <UserBubble>Сравни два варианта договора аренды склада и выпиши, чем они отличаются.</UserBubble>
    <div className="flex flex-col gap-3 text-sm leading-6">
      <p>Главные отличия:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Срок: в первом варианте 11 месяцев с продлением, во втором — 3 года без продления.</li>
        <li>Индексация: в первом — раз в год по договорённости, во втором — фиксированная, 5 % в год.</li>
        <li>Расторжение: во втором варианте нужно предупредить за 3 месяца, в первом — за месяц.</li>
      </ul>
    </div>
    {extra}
  </>
);

const RealComposer = ({ onSend, className }: { onSend?: () => void; className?: string }) => {
  const { tier, up } = useLimits();
  const models = useMemo(() => modelsFor(tier, up), [tier, up]);
  const [model, setModel] = useState<PickerModel>(models[0] as PickerModel);
  const favorites = useFavorites(models.filter((m) => !m.limit?.tier).map((m) => m.id));
  const attachments = useAttachments();
  return (
    <PickerDataProvider models={models} recent={[]}>
      <div className={className}>
        <Composer
          attachments={attachments}
          busy={false}
          favorites={favorites}
          model={model}
          onModel={setModel}
          onSend={() => onSend?.()}
          onServerReady={() => undefined}
          onStop={() => undefined}
          servers={[]}
        />
      </div>
    </PickerDataProvider>
  );
};

const head = (l: Limits) => headline(l);

// ── 1. Полоса ────────────────────────────────────────────────────────────────────────────────────────────────────────

const OutCard = ({ limits, tier }: { limits: Limits; tier: Parameters<typeof TierBadge>[0]["tier"] }) => {
  const h = head(limits);
  if (!h) return null;
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <Clock className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">Лимит на {h.kind === "five" ? "5 часов" : "неделю"} исчерпан</span>
            <span className="text-muted-foreground text-sm">Сброс в {h.reset}. До сброса сообщения не отправляются.</span>
          </div>
          <TierBadge tier={tier} />
        </div>
        <Bars dense limits={limits} />
      </FramePanel>
    </Frame>
  );
};

export const ChatStrip = () => {
  const { limits, tier } = useLimits();
  const h = head(limits);
  const out = h !== null && h.pct >= 100;
  const composer = out ? (
    <OutCard limits={limits} tier={tier} />
  ) : (
    <div className="flex flex-col">
      {h && (
        <div className="bg-muted/60 mx-3 flex items-center gap-2 rounded-t-xl border border-b-0 px-3 py-1.5 text-xs">
          <Gauge className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <span className="min-w-0 flex-1 truncate">{warnText(h)}</span>
          <span className="bg-muted relative h-1 w-16 shrink-0 overflow-hidden rounded-full max-sm:hidden">
            <span className="bg-warning absolute inset-y-0 left-0 rounded-full" style={{ width: `${h.pct}%` }} />
          </span>
        </div>
      )}
      <RealComposer />
    </div>
  );
  return (
    <ChatShell composer={composer}>
      <Thread />
    </ChatShell>
  );
};

// ── 2. Кольцо ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const ChatRing = () => {
  const { limits, tier } = useLimits();
  const h = head(limits);
  const out = h !== null && h.pct >= 100;
  const composer = (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          {h && (
            <Alert className="py-2" variant={out ? "destructive" : "warning"}>
              {out ? <CircleAlert /> : <TriangleAlert />}
              {out ? <AlertTitle>{warnText(h)}</AlertTitle> : <AlertDescription className="text-foreground">{warnText(h)}</AlertDescription>}
            </Alert>
          )}
        </div>
        {/* Кольцо видно всегда: больший из двух процентов, по наведению — обе полосы. */}
        <LimitsCard
          limits={limits}
          tier={tier}
          trigger={
            <span className="hover:bg-muted flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs tabular-nums">
              <Ring pct={topPct(limits)} size={18} />
              {topPct(limits)} %
            </span>
          }
        />
      </div>
      <RealComposer className={cn(out && "pointer-events-none opacity-50 select-none")} />
    </div>
  );
  return (
    <ChatShell composer={composer}>
      <Thread />
    </ChatShell>
  );
};

// ── 3. Строка ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const ChatLine = () => {
  const { limits, tier } = useLimits();
  const h = head(limits);
  const out = h !== null && h.pct >= 100;
  const [tried, setTried] = useState(false);
  const card =
    out && tried && h ? (
      <Frame>
        <FramePanel className="flex items-start gap-3 p-4">
          <Clock className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Сообщение не отправлено</span>
            <span className="text-muted-foreground text-sm">{warnText(h)}. Текст остался в поле ввода.</span>
          </div>
          <Button onClick={() => setTried(false)} size="sm" variant="ghost">
            Скрыть
          </Button>
        </FramePanel>
      </Frame>
    ) : null;
  const composer = (
    <div className="flex flex-col gap-1.5">
      {h && (
        <div className="flex justify-center text-xs">
          <LimitsCard
            limits={limits}
            tier={tier}
            trigger={
              <span className={cn("flex items-center gap-1.5", out ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                <span className={cn("size-1.5 rounded-full", out ? "bg-destructive" : "bg-warning")} />
                {warnText(h)}
              </span>
            }
          />
        </div>
      )}
      <RealComposer onSend={() => out && setTried(true)} />
    </div>
  );
  return (
    <ChatShell composer={composer}>
      <Thread extra={card} />
    </ChatShell>
  );
};
