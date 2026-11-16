"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { MailQuestion } from "lucide-react";
import { useState } from "react";

import { ENTER, PRESS, useProto } from "../memory/frame";
import { BoxPage, MAIL_HINT, MailRow, OtherRows, Section, WAITS, Welcome, askOfWait, useWaitActions, useWorld } from "./shared";

// Вариант 3 · «Предложение». Строки — как в «Строке как все». Пока память почту не читает, в «Не упустить» один раз
// стоит предложение: «Замечать письма без ответа?» с «Включить» и «Не надо» — само включение там же, без поиска по
// настройкам. Переключатель остаётся и на странице ящика.

const Offer = ({ onOn, onNo }: { onOn: () => void; onNo: () => void }) => (
  <div className={cn("bg-muted/40 flex flex-col gap-2 rounded-lg border border-dashed px-3.5 py-3 text-sm", ENTER)}>
    <span className="flex items-center gap-2 font-medium">
      <MailQuestion className="text-muted-foreground size-4" /> Замечать письма без ответа?
    </span>
    <span className="text-muted-foreground text-xs">
      Если человек из памяти не ответил на ваше письмо дольше обычного, оно появится здесь. {MAIL_HINT}
    </span>
    <div className="flex gap-2">
      <Button className={PRESS} onClick={onOn} size="sm">
        Включить для me@company.example
      </Button>
      <Button className={PRESS} onClick={onNo} size="sm" variant="ghost">
        Не надо
      </Button>
    </div>
  </div>
);

const OfferVariant = () => {
  const { mailOn, screen } = useWorld();
  const { setKnob, say } = useProto();
  const [gone, setGone] = useState<string[]>([]);
  const [declined, setDeclined] = useState(false);
  const act = useWaitActions();
  if (screen === "box") {
    return <BoxPage on={mailOn} onChange={(v) => setKnob("mail", v ? "on" : "off")} />;
  }
  const waits = mailOn ? WAITS.filter((w) => !gone.includes(w.id)) : [];
  return (
    <Welcome>
      {(put) => (
        <Section title="Не упустить">
          <div className="flex flex-col gap-1.5">
            {!mailOn && !declined && (
              <Offer
                onNo={() => {
                  setDeclined(true);
                  say("Больше не предложу. Включить можно на странице ящика");
                }}
                onOn={() => {
                  setKnob("mail", "on");
                  say("Включено. Первая проверка — в течение часа");
                }}
              />
            )}
            {waits.slice(0, 2).map((w, i) => (
              <MailRow
                key={w.id}
                n={i}
                onDismiss={() => act.dismiss(w, (id) => setGone((g) => [...g, id]))}
                onPut={() => put(askOfWait(w))}
                onRemind={() => act.remind(w)}
                w={w}
              />
            ))}
            <OtherRows put={put} start={waits.length} />
          </div>
        </Section>
      )}
    </Welcome>
  );
};

export default OfferVariant;
