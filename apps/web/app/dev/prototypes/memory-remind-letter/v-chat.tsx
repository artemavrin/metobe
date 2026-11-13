"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, Check, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { ENTER, PRESS, Shell, useProto } from "../memory/frame";
import { AddressField, Composer, MAILBOX, NoMailbox, Origin, Section, TodayRow, Welcome, askOf, modelOf, templateOf, useRows, useWorld } from "./shared";
import type { Row } from "./shared";

// Вариант 1 · «Через чат» (как записано в плане Г2.4). «Напомнить» открывает новый чат и сразу отправляет просьбу, в
// которую код подставил кому, что, когда обещано и срок. Письмо пишет модель чата; отправка — обычное окно «Отправить
// письмо?», как у любого письма из чата. Плюс: дальше можно попросить «короче» или «на ты» словами. Минус: на каждое
// напоминание остаётся чат.

/** Ответ появляется по частям: сначала слова, потом письмо. */
const useSteps = (count: number) => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= count) return;
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 500 : 900);
    return () => clearTimeout(t);
  }, [step, count]);
  return step;
};

/** Окно «Отправить письмо?» — как в приложении (components/chat/approval-card.tsx). */
const Approval = ({ row, to, onSent }: { row: Row; to: string; onSent: () => void }) => {
  const [done, setDone] = useState<"sent" | "no" | null>(null);
  if (done) {
    return (
      <div className={cn("text-muted-foreground flex items-center gap-2 text-sm", ENTER)}>
        <Check className="size-4" />
        {done === "sent" ? `Отправлено: ${to} · на карточке «${row.who?.name}» — напомнил про ${row.topic}` : "Не отправлено"}
      </div>
    );
  }
  return (
    <div className={cn("bg-muted/60 flex w-full flex-col gap-3 rounded-xl px-3 py-2.5", ENTER)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="bg-background text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
          <Mail className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col text-sm">
          <span className="font-medium">Отправить письмо?</span>
          <span className="text-muted-foreground">Модель написала письмо от вашего имени — проверьте перед отправкой.</span>
        </div>
      </div>
      <div className="bg-background flex flex-col gap-2 rounded-lg border p-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">От</dt>
          <dd>{MAILBOX}</dd>
          <dt className="text-muted-foreground">Кому</dt>
          <dd className="break-words">{to}</dd>
          <dt className="text-muted-foreground">Тема</dt>
          <dd>{templateOf(row).subject}</dd>
        </dl>
        <p className="border-t pt-2 whitespace-pre-line">{modelOf(row, "base")}</p>
      </div>
      <div className="flex items-center justify-end gap-1">
        <Button onClick={() => setDone("no")} size="sm" variant="ghost">
          Не отправлять
        </Button>
        <Button
          className={PRESS}
          onClick={() => {
            setDone("sent");
            onSent();
          }}
          size="sm"
        >
          Отправить
        </Button>
      </div>
    </div>
  );
};

/** Ответ модели: что обещано и когда, потом письмо — или вопрос об адресе, или письмо текстом без ящика. */
const Answer = ({ row, onSent }: { row: Row; onSent: () => void }) => {
  const world = useWorld();
  const [addr, setAddr] = useState("");
  const [asked, setAsked] = useState(world.addr);
  const step = useSteps(2);
  const late = row.due ? `, срок ${row.due} прошёл` : "";
  if (step === 0) {
    return <span className="text-muted-foreground animate-pulse text-sm">Пишу…</span>;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className={ENTER}>
        Обещано{row.given ? ` ${row.given.day}` : ""}: «{row.text.toLowerCase()}»{late}.
        {asked ? " Вот напоминание:" : ` На карточке «${row.who?.name}» нет адреса — куда написать?`}
      </p>
      {asked ? null : (
        <div className={cn("flex items-start gap-2", ENTER)}>
          <div className="flex-1">
            <AddressField onChange={setAddr} row={row} value={addr} />
          </div>
          <Button className={PRESS} disabled={!addr.includes("@")} onClick={() => setAsked(true)} size="sm">
            Дальше
          </Button>
        </div>
      )}
      {asked && step >= 2 && world.box && <Approval onSent={onSent} row={row} to={world.addr ? `${row.who?.name} <${row.who?.email}>` : addr} />}
      {asked && step >= 2 && !world.box && (
        <div className={cn("flex flex-col gap-3", ENTER)}>
          <p className="bg-muted/60 rounded-lg p-3 whitespace-pre-line">{modelOf(row, "base")}</p>
          <NoMailbox text={modelOf(row, "base")} />
        </div>
      )}
    </div>
  );
};

/** Новый чат: просьба человека пузырём справа, ответ под ней. «Где обещано» — сразу под просьбой. */
const Conversation = ({ row, onBack, onSent }: { row: Row; onBack: () => void; onSent: () => void }) => {
  const [text, setText] = useState("");
  const { say } = useProto();
  return (
    <Shell area="chat" title={`Напомнить: ${row.who?.name}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pt-16 pb-6">
        <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs" onClick={onBack} type="button">
          <ArrowLeft className="size-3.5" /> К новому чату
        </button>
        <div className="flex flex-col items-end gap-1.5">
          <div className={cn("bg-muted max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", ENTER)}>
            Напомни{" "}
            <span className="bg-background rounded-md border px-1.5 py-0.5 text-xs font-medium">{row.who?.name}</span> про {row.topic}
          </div>
          <Origin className="justify-end" row={row} />
        </div>
        <Answer onSent={onSent} row={row} />
      </div>
      <Composer
        onChange={setText}
        onSend={() => {
          say("Модель перепишет письмо по просьбе");
          setText("");
        }}
        text={text}
      />
    </Shell>
  );
};

const Chat = () => {
  const { rows, drop } = useRows();
  const [open, setOpen] = useState<Row | null>(null);
  if (open) {
    return <Conversation key={open.id} onBack={() => setOpen(null)} onSent={() => drop(open.id)} row={open} />;
  }
  return (
    <Welcome>
      {(put) => (
        <Section title="Не упустить">
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => (
              <TodayRow key={row.id} n={i} onPut={(r) => put(askOf(r))} onRemind={setOpen} row={row} />
            ))}
          </div>
        </Section>
      )}
    </Welcome>
  );
};

export default Chat;
