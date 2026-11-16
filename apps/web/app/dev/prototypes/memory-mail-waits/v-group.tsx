"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Mail } from "lucide-react";
import { useState } from "react";

import { ENTER, PRESS, Shell, rise, usePhone, useProto } from "../memory/frame";
import { BOXES, OtherRows, ReadToggle, Section, WAITS, Welcome, askOfWait, useWaitActions, useWorld } from "./shared";
import type { Wait } from "./shared";

// Вариант 2 · «Отдельно». Под обещаниями — свой подраздел «Ждут ответа по почте»: короткие строки «тема — кто · дни»,
// больше двух — свёрнуты. Переключатели собраны в настройках «Памяти»: список ящиков, у каждого — свой.

const Line = ({ w, n, put }: { w: Wait; n: number; put: (t: string) => void }) => {
  const phone = usePhone();
  const act = useWaitActions();
  return (
    <li className={cn("group flex items-center gap-2 py-1.5 text-sm", ENTER)} style={rise(n)}>
      <button className="flex min-w-0 flex-1 items-baseline gap-2 text-left" onClick={() => put(askOfWait(w))} type="button">
        <span className="min-w-0 truncate">«{w.subject}»</span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {w.who.name} · {w.days} раб. дн.
        </span>
      </button>
      <Button
        className={cn("h-7 gap-1.5 px-2 text-xs", PRESS, !phone && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
        onClick={() => act.remind(w)}
        size="sm"
        variant="ghost"
      >
        <Mail className="size-3.5" />
        {phone ? null : "Напомнить"}
      </Button>
    </li>
  );
};

const MemorySettings = () => {
  const [on, setOn] = useState(BOXES.map((b) => b.on));
  return (
    <Shell area="memory" title="Память">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 @lg:pt-20">
        <h2 className="text-lg font-semibold">Настройки памяти</h2>
        <section className="flex flex-col gap-1">
          <h3 className="text-muted-foreground text-xs font-medium">Почта</h3>
          <div className="flex flex-col divide-y rounded-lg border px-4">
            {BOXES.map((b, i) => (
              <div key={b.address}>
                <span className="block pt-3 text-sm">{b.address}</span>
                <ReadToggle
                  checked={b.checked}
                  on={on[i] ?? false}
                  onChange={(v) => setOn((o) => o.map((x, j) => (j === i ? v : x)))}
                  waits={b.waits}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
};

const GroupVariant = () => {
  const { mailOn, screen } = useWorld();
  const [open, setOpen] = useState(false);
  useProto();
  if (screen === "box") {
    return <MemorySettings />;
  }
  const waits = mailOn ? WAITS : [];
  const shown = open ? waits : waits.slice(0, 2);
  return (
    <Welcome>
      {(put) => (
        <div className="flex flex-col gap-6">
          <Section title="Не упустить">
            <div className="flex flex-col gap-1.5">
              <OtherRows put={put} start={0} />
            </div>
          </Section>
          {waits.length > 0 && (
            <Section title={`Ждут ответа по почте · ${waits.length}`}>
              <ul className="flex flex-col divide-y rounded-lg border px-3.5">
                {shown.map((w, i) => (
                  <Line key={w.id} n={i} put={put} w={w} />
                ))}
              </ul>
              {waits.length > 2 && (
                <button className="text-muted-foreground hover:text-foreground mt-1.5 flex items-center gap-1 text-xs" onClick={() => setOpen((o) => !o)} type="button">
                  <ChevronDown className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} />
                  {open ? "Свернуть" : `Ещё ${waits.length - 2}`}
                </button>
              )}
            </Section>
          )}
        </div>
      )}
    </Welcome>
  );
};

export default GroupVariant;
