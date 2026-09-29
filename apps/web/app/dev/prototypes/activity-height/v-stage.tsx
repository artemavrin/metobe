"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import { Expand, fmtSec, groupSteps, plural, StepDetail, StepIcon, stepTitle } from "../activity/parts";
import type { Item } from "../activity/parts";
import { useRun } from "../activity/run";
import type { StepView } from "../activity/run";
import { Stage } from "../activity/stage";
import { CallList, FadeBox, RibbonHeader, useOpen } from "./kit";

// «Полоса и сцена»: все шаги — полоса маленьких значков (тул с числом вызовов — один значок «×6»), а под ней одна сцена
// фиксированной высоты: она показывает выбранный шаг, по умолчанию — идущий сейчас, и прокручивается внутри. Лента ни
// растёт, ни прыгает: полоса переносится на строку от силы раз в десять шагов, сцена не меняет высоту никогда. Цена:
// за раз виден один шаг, чтобы посмотреть другой — нажать на его значок.

const idOf = (it: Item) => (it.type === "step" ? it.v.step.id : it.id);
const viewsOf = (it: Item) => (it.type === "step" ? [it.v] : it.vs);

const titleOf = (it: Item) => {
  if (it.type === "step") {
    return stepTitle(it.v);
  }
  const first = it.vs[0] as StepView;
  return first.step.kind === "fetch"
    ? `Прочитано ${it.vs.length} ${plural(it.vs.length, ["страница", "страницы", "страниц"])}`
    : `${first.step.server ?? "Поиск"} · ${first.step.tool ?? ""} × ${it.vs.length}`;
};

const Body = () => {
  const r = useRun();
  const [open, toggle] = useOpen();
  const [picked, setPicked] = useState<string | null>(null);
  const items = groupSteps(r.views);
  const current = items.at(-1);
  const shown = items.find((it) => idOf(it) === picked) ?? current;
  const onCurrent = !shown || shown === current;
  const running = shown ? viewsOf(shown).some((v) => v.state === "running") : false;
  return (
    <section className="flex w-full flex-col">
      <RibbonHeader onToggle={toggle} open={open} />
      <Expand open={open}>
        <div className="flex flex-col gap-2 pb-2">
          <div className="flex flex-wrap gap-1">
            {items.map((it) => {
              const id = idOf(it);
              const vs = viewsOf(it);
              const last = vs.at(-1) as StepView;
              const state = vs.find((v) => v.state === "error")?.state ?? last.state;
              return (
                <button
                  aria-label={titleOf(it)}
                  aria-pressed={shown === it}
                  className={cn(
                    "animate-in fade-in zoom-in-90 hover:bg-muted/70 flex h-7 items-center gap-1 rounded-md px-1.5 text-xs transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:zoom-in-100",
                    shown === it && "bg-muted"
                  )}
                  key={id}
                  onClick={() => setPicked(id === (current && idOf(current)) ? null : id)}
                  title={titleOf(it)}
                  type="button"
                >
                  <StepIcon surface="bg-transparent" v={{ ...last, state }} />
                  {vs.length > 1 && <span className="text-muted-foreground tabular-nums">×{vs.length}</span>}
                </button>
              );
            })}
          </div>
          {shown && (
            <div className="border-border flex h-44 flex-col border-l pl-3">
              <div className="flex h-7 shrink-0 items-center gap-2 text-sm">
                <span className={cn("min-w-0 flex-1 truncate", running ? "shimmer" : "text-muted-foreground")}>{titleOf(shown)}</span>
                {!onCurrent && (
                  <Button onClick={() => setPicked(null)} size="xs" variant="ghost">
                    К текущему
                  </Button>
                )}
                <span className="text-muted-foreground text-xs tabular-nums">{fmtSec(viewsOf(shown).reduce((s, v) => s + v.ms, 0))}</span>
              </div>
              <FadeBox className="min-h-0 flex-1" follow={running && onCurrent} key={idOf(shown)}>
                <div className="pb-2">
                  {shown.type === "step" ? <StepDetail controls v={shown.v} /> : <CallList chips slot="h-24" surface="bg-background" vs={shown.vs} />}
                </div>
              </FadeBox>
            </div>
          )}
        </div>
      </Expand>
    </section>
  );
};

export const StageRibbon = () => <Stage activity={<Body />} />;
