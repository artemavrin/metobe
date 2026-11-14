"use client";

import { useState } from "react";

import { useProto } from "../memory/frame";
import { BoxPage, MailRow, OtherRows, Section, WAITS, Welcome, askOfWait, useWaitActions, useWorld } from "./shared";

// Вариант 1 · «Строка как все». Письмо без ответа — обычная строка «Не упустить» среди обещаний: значок письма,
// «Нет ответа: «тема»», справа — сколько рабочих дней и кому; при наведении «Напомнить» (ответом в цепочку). Включается
// на странице ящика: «Замечать письма без ответа».

const RowVariant = () => {
  const { mailOn, screen } = useWorld();
  const { setKnob } = useProto();
  const [gone, setGone] = useState<string[]>([]);
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

export default RowVariant;
