"use client";

import { cn } from "@metobe/ui/lib/utils";

import { useRun } from "./run";
import { useProto } from "./state";

// Сцена: то, среди чего живёт карточка — чат с вопросом сверху и ответом, который печатается после работы. На телефоне
// кадр 390 px; шторка панели живёт внутри кадра. `panel` — боковая панель третьего варианта.

const Thread = ({ activity }: { activity: React.ReactNode }) => {
  const r = useRun();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-sm">{r.script.question}</div>
      <div className="flex flex-col gap-3">
        {activity}
        {r.answerText && (
          <p className="animate-in fade-in text-sm leading-relaxed duration-200 motion-reduce:animate-none">{r.answerText}</p>
        )}
      </div>
    </div>
  );
};

export const Stage = ({
  activity,
  panel,
  panelOpen,
}: {
  activity: React.ReactNode;
  panel?: (phone: boolean) => React.ReactNode;
  panelOpen?: boolean;
}) => {
  const { phone } = useProto();
  const { note } = useRun();
  const toast = note && (
    <div className="bg-foreground text-background absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs whitespace-nowrap">
      Откроется: {note}
    </div>
  );
  if (phone) {
    return (
      <div className="bg-background relative flex h-dvh items-center justify-center overflow-hidden p-3 pb-20">
        <div
          className="ring-border bg-background relative flex h-[760px] max-h-[calc(100dvh-7rem)] w-[390px] flex-col overflow-hidden rounded-[2rem] ring-1"
          data-phone-frame
        >
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <Thread activity={activity} />
          </div>
          {panelOpen && panel?.(true)}
        </div>
        {toast}
      </div>
    );
  }
  return (
    <div className="bg-background relative flex h-dvh overflow-hidden">
      <div className={cn("no-scrollbar min-w-0 flex-1 overflow-y-auto pt-8")}>
        <Thread activity={activity} />
      </div>
      {panelOpen && panel?.(false)}
      {toast}
    </div>
  );
};
