"use client";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider, useProto } from "../memory/frame";
import { ChatLine, ChatRing, ChatStrip } from "./chat";
import { PageMenu, PageRows, PageTiles } from "./limits-page";

// P35 · лимиты человека (ORGS-PLAN §7.6, D48): полосы «5 часов» и «неделя» со сбросом, предупреждение над полем
// ввода с 80 %, карточка при 100 %, «×N к лимиту» в настоящем выборе модели, модели старших тарифов — серыми или
// скрыты. Денег нигде нет. Варианты: «Полоса», «Кольцо», «Строка» (чем отличаются — в chat.tsx и limits-page.tsx).
// В адресе: `?v=1..3`, `scr=chat|page`, `st=ok|warn5|warnweek|out5|outweek`, `tier=base|pro|max`, `up=grey|hide`,
// `sz=phone`.

const pick = (chat: () => React.ReactNode, page: () => React.ReactNode) => {
  const Variant = () => {
    const { knobs } = useProto();
    const Scene = knobs.scr === "page" ? page : chat;
    return <Scene key={`${knobs.st}-${knobs.tier}-${knobs.up}`} />;
  };
  return Variant;
};

const Strip = pick(ChatStrip, PageRows);
const RingV = pick(ChatRing, PageTiles);
const Line = pick(ChatLine, PageMenu);

const SeatLimitsPage = () => (
  <ProtoProvider defaults={{ scr: "chat", st: "warn5", tier: "base", up: "grey" }}>
    <style>{"@media (max-width: 760px) { .proto-picker { max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none; } }"}</style>
    <Picker
      params={
        <Params
          rows={[
            ["scr", "экран", [["chat", "чат"], ["page", "лимиты"]]],
            ["st", "лимит", [["ok", "23 %"], ["warn5", "5 ч 84 %"], ["warnweek", "нед 88 %"], ["out5", "5 ч 100 %"], ["outweek", "нед 100 %"]]],
            ["tier", "место", [["base", "Обычный"], ["pro", "Про"], ["max", "Макс"]]],
            ["up", "старшие модели", [["grey", "серыми"], ["hide", "скрыть"]]],
          ]}
        />
      }
      variants={[
        { Component: Strip, name: "Полоса" },
        { Component: RingV, name: "Кольцо" },
        { Component: Line, name: "Строка" },
      ]}
    />
  </ProtoProvider>
);

export default SeatLimitsPage;
