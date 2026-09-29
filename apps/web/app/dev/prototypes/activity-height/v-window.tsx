"use client";

import { ThoughtWindow } from "@/components/chat/thought-window";

import { Expand, Timeline } from "../activity/parts";
import { useRun } from "../activity/run";
import { Stage } from "../activity/stage";
import { RibbonHeader, useOpen } from "./kit";

// «Одно окно»: вся лента шагов — в окне фиксированной высоты (12 rem, как раньше у «Думает»): что длиннее — прокручивается
// внутри, край с продолжением затухает, а пока идёт работа, новейший шаг держится в поле зрения. Раскрытые шаги растут
// внутри окна, поэтому страница не двигается ни при каком вызове. Цена: за раз видно чуть больше четырёх строк.

const Body = () => {
  const r = useRun();
  const [open, toggle] = useOpen();
  const working = r.phase === "working" || r.phase === "waiting";
  return (
    <section className="flex w-full flex-col">
      <RibbonHeader onToggle={toggle} open={open} />
      <Expand open={open}>
        <ThoughtWindow className="pb-2" following={working} startAtEnd={working}>
          <Timeline fold={false} surface="bg-background" views={r.views} />
        </ThoughtWindow>
      </Expand>
    </section>
  );
};

export const WindowRibbon = () => <Stage activity={<Body />} />;
