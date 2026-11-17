"use client";

import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import type { Model, Piece } from "./data";
import { AttachmentLine, BlockHead, Flow, Legend, LocalNote, MaskedText, OriginalSwitch, RestoredBadge, Well } from "./parts";

// «Что увидела модель» и «Что получит модель» — один блок: запрос с метками, вложение, легенда, путь, ответ до
// восстановления. Для локальной модели меток нет: текст как есть и строка «Не покидает сервер».

const plain = (pieces: Piece[]) => pieces.map((p) => (typeof p === "string" ? p : p.original)).join("");

export const RestoringStatus = ({ className }: { className?: string }) => (
  <span className={cn("text-muted-foreground flex items-center gap-2 text-sm", className)} role="status">
    <Spinner className="size-3.5" />
    <span className="shimmer">Восстанавливаю данные</span>
  </span>
);

export const ModelView = ({
  question,
  model,
  answer,
  attachment,
  future = false,
}: {
  question: Piece[];
  model: Model;
  answer?: { pieces: Piece[]; holding: boolean; done: boolean };
  attachment?: string;
  /** Предпросмотр до отправки: «получит», «уходит». */
  future?: boolean;
}) => {
  const [original, setOriginal] = useState(false);
  const hasHidden = question.some((p) => typeof p !== "string");
  return (
    <div className="flex flex-col gap-3.5">
      <BlockHead action={!model.local && hasHidden ? <OriginalSwitch on={original} onChange={setOriginal} /> : null}>
        {future ? "Сообщение" : "Запрос"}
      </BlockHead>
      <Well>{model.local ? <p className="leading-7">{plain(question)}</p> : <MaskedText original={original} pieces={question} />}</Well>
      {attachment && <AttachmentLine name={attachment} sent={!future} />}
      {model.local ? <LocalNote /> : <Legend className="px-0.5" pieces={question} />}
      <div className="border-t pt-3.5">
        <Flow live={Boolean(answer && !answer.done)} model={model} />
      </div>
      {answer && !model.local && (
        <>
          <BlockHead action={answer.holding ? <RestoringStatus /> : answer.done ? <RestoredBadge /> : null}>
            Ответ до восстановления
          </BlockHead>
          <Well>
            <MaskedText original={original} pieces={answer.pieces} />
          </Well>
        </>
      )}
    </div>
  );
};
