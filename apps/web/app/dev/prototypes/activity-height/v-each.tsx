"use client";

import { Expand, StepDetail, Timeline } from "../activity/parts";
import { useRun } from "../activity/run";
import { Stage } from "../activity/stage";
import { CallList, FadeBox, RibbonHeader, useOpen } from "./kit";

// «Каждый шаг»: лента растёт как растёт, но каждый раскрытый шаг ограничен сам — шесть строк, дальше своя прокрутка с
// затуханием. Серия вызовов одного тула складывается в список коротких строк («№3 · fullName: … · detail: full»), из
// которых открыт один, тоже в окне. Старые шаги при длинной серии уходят в «Ещё N шагов». Цена: лента всё-таки растёт
// по строке на шаг, зато ни один шаг не выше шести строк.

const Body = () => {
  const r = useRun();
  const [open, toggle] = useOpen();
  return (
    <section className="flex w-full flex-col">
      <RibbonHeader onToggle={toggle} open={open} />
      <Expand open={open}>
        <div className="pb-2">
          <Timeline
            renderDetail={(v) => (
              <FadeBox className="max-h-36" follow={v.state === "running"}>
                <StepDetail controls v={v} />
              </FadeBox>
            )}
            renderGroup={(vs) => <CallList chips slot="h-28" surface="bg-background" vs={vs} />}
            surface="bg-background"
            views={r.views}
          />
        </div>
      </Expand>
    </section>
  );
};

export const EachRibbon = () => <Stage activity={<Body />} />;
