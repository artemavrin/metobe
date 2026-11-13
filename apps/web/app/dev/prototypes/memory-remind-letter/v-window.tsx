"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { AtSign, Mail, Type, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ENTER, PRESS, usePhone, useProto } from "../memory/frame";
import { AddressField, MAILBOX, NoMailbox, Origin, Section, TodayRow, Welcome, askOf, modelOf, sentNote, templateOf, useRows, useWorld } from "./shared";
import type { Row } from "./shared";

// Вариант 3 · «Окно». «Напомнить» открывает окно в том же виде, что окно обещания в календаре («Строки»): значок и
// значение в строке — от кого, кому, тема; ниже текст. Текст пишет модель чата за секунду-две, кнопки «Короче» и
// «Мягче» просят её переписать. Чат не открывается, разговора не остаётся — только письмо и событие на карточке.

type Tone = "base" | "short" | "soft";

const Line = ({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) => (
  <div className="flex min-h-8 items-center gap-3 text-sm">
    <Icon className="text-muted-foreground size-4 shrink-0" />
    <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
  </div>
);

/** Модель пишет: строки-заглушки на месте текста. */
const Writing = () => (
  <div aria-label="Пишется…" className="flex flex-col gap-2 py-1">
    {[92, 100, 76, 40].map((w) => (
      <span className="bg-muted h-3.5 animate-pulse rounded" key={w} style={{ width: `${w}%` }} />
    ))}
  </div>
);

const useLetter = (row: Row) => {
  const [tone, setTone] = useState<Tone>("base");
  const [busy, setBusy] = useState(true);
  const [text, setText] = useState("");
  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => {
      setText(modelOf(row, tone));
      setBusy(false);
    }, 1100);
    return () => clearTimeout(t);
  }, [row, tone]);
  return { busy, setText, setTone, text, tone };
};

const Letter = ({ row, onClose, onSent }: { row: Row; onClose: () => void; onSent: () => void }) => {
  const world = useWorld();
  const letter = useLetter(row);
  const [subject, setSubject] = useState(templateOf(row).subject);
  const [addr, setAddr] = useState("");
  const to = world.addr ? row.who?.email : addr;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <span className="text-muted-foreground text-xs">Напомнить · {row.who?.name}</span>
        <button aria-label="Закрыть" className="text-muted-foreground hover:text-foreground -me-1 -mt-1 p-1" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col">
        <Line icon={AtSign}>
          {world.addr ? (
            <span className="flex min-w-0 flex-wrap gap-x-1">
              {row.who?.name} <span className="text-muted-foreground break-all">&lt;{row.who?.email}&gt;</span>
            </span>
          ) : (
            <div className="flex-1 py-1">
              <AddressField onChange={setAddr} row={row} value={addr} />
            </div>
          )}
        </Line>
        {world.box && (
          <Line icon={Mail}>
            <span className="text-muted-foreground truncate">от {MAILBOX}</span>
          </Line>
        )}
        <Line icon={Type}>
          <input aria-label="Тема" className="w-full bg-transparent outline-none" onChange={(e) => setSubject(e.target.value)} value={subject} />
        </Line>
      </div>
      <div className="border-t pt-3">
        {letter.busy ? (
          <Writing />
        ) : (
          <textarea
            aria-label="Текст письма"
            className={cn("min-h-28 w-full resize-none bg-transparent text-sm leading-6 outline-none [field-sizing:content]", ENTER)}
            onChange={(e) => letter.setText(e.target.value)}
            value={letter.text}
          />
        )}
        <div className="mt-2 flex gap-1">
          {(
            [
              ["short", "Короче"],
              ["soft", "Мягче"],
            ] as const
          ).map(([tone, label]) => (
            <button
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150",
                letter.tone === tone ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              disabled={letter.busy}
              key={tone}
              onClick={() => letter.setTone(letter.tone === tone ? "base" : tone)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Origin row={row} />
      <div className="border-t pt-3">
        {world.box ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Текст написала модель — проверьте</span>
            <Button className={PRESS} disabled={letter.busy || !to?.includes("@")} onClick={onSent}>
              Отправить
            </Button>
          </div>
        ) : (
          <NoMailbox text={`${subject}\n\n${letter.text}`} />
        )}
      </div>
    </div>
  );
};

const Window = () => {
  const phone = usePhone();
  const { say } = useProto();
  const { rows, drop } = useRows();
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <Welcome>
      {(put) => (
        <>
          <Section title="Не упустить">
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <TodayRow key={row.id} n={i} onPut={(r) => put(askOf(r))} onRemind={setOpen} row={row} />
              ))}
            </div>
          </Section>
          {open && (
            <div
              className={cn(phone ? "absolute items-end" : "fixed items-start pt-[12vh]", "inset-0 z-40 flex justify-center bg-black/40")}
              onClick={(e) => e.target === e.currentTarget && setOpen(null)}
            >
              <div
                className={cn(
                  "bg-popover text-popover-foreground w-[28rem] max-w-[calc(100%-2rem)] border p-5 pb-4 shadow-2xl",
                  phone ? "mb-2 rounded-3xl" : "rounded-2xl",
                  ENTER
                )}
                role="dialog"
              >
                <Letter
                  key={open.id}
                  onClose={() => setOpen(null)}
                  onSent={() => {
                    drop(open.id);
                    say(sentNote(open));
                    setOpen(null);
                  }}
                  row={open}
                />
              </div>
            </div>
          )}
        </>
      )}
    </Welcome>
  );
};

export default Window;
