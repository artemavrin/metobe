"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { MessageSquareText } from "lucide-react";
import { useState } from "react";

import { ENTER, PRESS, useProto } from "../memory/frame";
import { AddressField, MAILBOX, NoMailbox, Origin, Section, TodayRow, Welcome, askOf, sentNote, templateOf, useRows, useWorld } from "./shared";
import type { Row } from "./shared";

// Вариант 2 · «На месте». Модели нет: «Напомнить» раскрывает под строкой письмо, собранное кодом по шаблону (кому,
// что, к какому сроку, когда обещано). Его можно поправить прямо здесь и отправить, не уходя с экрана. Хочется
// другого тона — «Написать в чате» кладёт просьбу в поле, дальше как сейчас.

const Draft = ({ row, onSent, onClose, put }: { row: Row; onSent: () => void; onClose: () => void; put: (t: string) => void }) => {
  const world = useWorld();
  const start = templateOf(row);
  const [subject, setSubject] = useState(start.subject);
  const [text, setText] = useState(start.text);
  const [addr, setAddr] = useState("");
  const to = world.addr ? row.who?.email : addr;
  return (
    <div className={cn("bg-background mt-2 flex flex-col gap-3 rounded-lg border p-3 text-sm", ENTER)}>
      <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">Кому</dt>
        <dd className="min-w-0">
          {world.addr ? (
            <span className="flex min-w-0 flex-wrap gap-x-1">
              {row.who?.name} <span className="text-muted-foreground break-all">&lt;{row.who?.email}&gt;</span>
            </span>
          ) : (
            <AddressField onChange={setAddr} row={row} value={addr} />
          )}
        </dd>
        {world.box && (
          <>
            <dt className="text-muted-foreground">От</dt>
            <dd className="text-muted-foreground truncate">{MAILBOX}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Тема</dt>
        <dd>
          <input aria-label="Тема" className="w-full bg-transparent outline-none" onChange={(e) => setSubject(e.target.value)} value={subject} />
        </dd>
      </dl>
      <textarea
        aria-label="Текст письма"
        className="min-h-32 w-full resize-none border-t bg-transparent pt-3 leading-6 outline-none [field-sizing:content]"
        onChange={(e) => setText(e.target.value)}
        value={text}
      />
      <Origin row={row} />
      {world.box ? (
        <div className="flex items-center gap-1 border-t pt-3">
          <Button
            className="text-muted-foreground gap-1.5 font-normal"
            onClick={() => {
              onClose();
              put(askOf(row));
            }}
            size="sm"
            variant="ghost"
          >
            <MessageSquareText /> Написать в чате
          </Button>
          <Button className="ms-auto" onClick={onClose} size="sm" variant="ghost">
            Отмена
          </Button>
          <Button className={PRESS} disabled={!to?.includes("@")} onClick={onSent} size="sm">
            Отправить
          </Button>
        </div>
      ) : (
        <div className="border-t pt-3">
          <NoMailbox text={`${subject}\n\n${text}`} />
        </div>
      )}
    </div>
  );
};

const Inline = () => {
  const { say } = useProto();
  const { rows, drop } = useRows();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Welcome>
      {(put) => (
        <Section title="Не упустить">
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <div key={row.id}>
                <TodayRow n={i} onPut={(r) => put(askOf(r))} onRemind={(r) => setOpen((o) => (o === r.id ? null : r.id))} open={open === row.id} row={row} />
                {open === row.id && (
                  <Draft
                    onClose={() => setOpen(null)}
                    onSent={() => {
                      setOpen(null);
                      drop(row.id);
                      say(sentNote(row));
                    }}
                    put={put}
                    row={row}
                  />
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </Welcome>
  );
};

export default Inline;
