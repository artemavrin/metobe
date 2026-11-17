"use client";

import { Button } from "@metobe/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { Tooltip, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, FileSpreadsheet, Plus, Server, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ATTACHMENT, hiddenSummary, splitByValues } from "./data";
import { ChatShell, usePhone } from "./frame";
import { Expand, LENS_CSS, Mark, Seen } from "./lens";
import { AttachmentLine, ENTER, PRESS, Tip } from "./parts";
import { Earlier, Hint, ModelMenu, useComposerScene } from "./s-composer";
import type { Scene } from "./s-composer";

// Сцена «Ввод» (З7, вторая редакция). Тот же значок, что в ленте, — в строке кнопок поля, рядом с моделью.
// Спорное — как показывать:
//   1 «На месте» — скрываемое подчёркнуто точками прямо в тексте, пока человек печатает (как проверка орфографии);
//     значок меняет текст поля на то, что получит модель; второе нажатие, Esc или нажатие на текст возвращают ввод;
//   2 «Над текстом» — подчёркивания нет; значок раскрывает версию модели внутри поля, над текстом.
// Нет скрытого — нет значка. Ручки: `model=cloud|local`, `att=no|yes`, `svc=ok|down`, `open=1`.

const DOWN = "Служба маскирования не отвечает. Во внешнюю модель запросы не уходят; локальные модели работают.";

/** Локальная модель или служба не отвечает: не переключатель, а состояние. Иначе — ничего. */
const StateNote = ({ scene, compact }: { scene: Scene; compact: boolean }) => {
  if (scene.local) {
    return (
      <Tooltip>
        <TooltipTrigger
          delay={300}
          render={<span className={cn("text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs", ENTER)} />}
        >
          <Server className="size-3.5" />
          {!compact && "Не покидает сервер"}
        </TooltipTrigger>
        <Tip>Локальная модель получает текст как есть</Tip>
      </Tooltip>
    );
  }
  if (scene.down) {
    return (
      <Tooltip>
        <TooltipTrigger
          delay={300}
          render={<span className={cn("text-destructive flex h-7 min-w-0 items-center gap-1.5 px-2 text-xs", ENTER)} role="status" />}
        >
          <ShieldAlert className="size-3.5 shrink-0" />
          <span className="truncate">{compact ? "Защита недоступна" : "Не уйдёт: защита данных недоступна"}</span>
        </TooltipTrigger>
        <Tip>{DOWN}</Tip>
      </Tooltip>
    );
  }
  return null;
};

const sendTip = (scene: Scene) => `Скрыто: ${hiddenSummary(scene.hidden)}${scene.att ? ". Файл уходит без маскирования" : ""}`;

/** Открыть по `open=1`, когда черновик допечатан и маска пришла. */
const useOpen = (scene: Scene) => {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  if (scene.wantOpen && !scene.draft.typing && scene.hidden.length > 0 && !asked) {
    setAsked(true);
    setOpen(true);
  }
  // Скрывать стало нечего (текст стёрли, сменили модель) — показывать нечего.
  const can = scene.hidden.length > 0 && !scene.local && !scene.down;
  return [open && can, setOpen, can] as const;
};

const FIELD = "px-2.5 py-1.5 text-sm leading-6 break-words whitespace-pre-wrap";

/** Поле: текст с подчёркнутым скрываемым или, под значком, то, что получит модель, — на том же месте. */
const Field = ({ scene, lens, onBack, underline }: { scene: Scene; lens: boolean; onBack: () => void; underline: boolean }) => {
  const field = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const { text, pieces, onChange } = scene.draft;
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, lens]);
  // Возврат к вводу — курсор снова в поле.
  const [was, setWas] = useState(lens);
  useEffect(() => {
    if (was && !lens) field.current?.focus();
    setWas(lens);
  }, [lens, was]);
  useEffect(() => {
    if (!lens) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lens, onBack]);
  // Подчёркивание — по значениям из прошлого ответа шлюза, найденным в тексте как он есть сейчас: пока человек
  // печатает дальше, черта стоит на месте, новая появляется с ответом шлюза.
  const values = [...new Set(pieces.flatMap((p) => (typeof p === "string" ? [] : [p.original])))];
  const parts = underline && !scene.local && !scene.down ? splitByValues(text, values) : [text];
  return (
    <div className="relative">
      <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden text-transparent", FIELD, lens && "hidden")} ref={mirror}>
        {parts.map((part, i) =>
          i % 2 ? (
            // oxlint-disable-next-line react/no-array-index-key -- куски текста не переставляются
            <span className="p31-line underline decoration-emerald-600/70 decoration-dotted decoration-[1.5px] underline-offset-[5px] dark:decoration-emerald-400/70" key={i}>
              {part}
            </span>
          ) : (
            // oxlint-disable-next-line react/no-array-index-key -- то же
            <span key={i}>{part}</span>
          )
        )}
      </div>
      <textarea
        aria-label="Сообщение"
        className={cn(
          "placeholder:text-muted-foreground relative block max-h-48 min-h-9 w-full resize-none bg-transparent outline-none [scrollbar-width:none]",
          FIELD,
          lens && "hidden"
        )}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop;
        }}
        placeholder="Спросите что-нибудь"
        ref={field}
        rows={1}
        value={text}
      />
      {lens && (
        // Нажатие на текст возвращает ввод: это то же поле, а не отдельное окно.
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- с клавиатуры — Esc и сам значок
        <div className={cn("max-h-48 min-h-9 cursor-text overflow-y-auto [scrollbar-width:none]", FIELD)} onClick={onBack}>
          <Seen lens pieces={pieces} />
          {scene.att && (
            <div className="pt-1.5">
              <AttachmentLine name={ATTACHMENT} sent={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** «Таблетка» поля, как в чате: вложение, текст, плюс, значок, модель, отправка. */
const Pill = ({ scene, top, field, mark }: { scene: Scene; top?: ReactNode; field: ReactNode; mark: ReactNode }) => (
  <div className="bg-muted/70 dark:bg-muted/40 border-border/70 focus-within:border-foreground/15 relative rounded-[24px] border p-1.5 [transition:border-color_200ms_ease]">
    {top}
    {scene.att && (
      <div className="px-1.5 pt-1 pb-1.5">
        <span className="bg-background/70 flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
          <FileSpreadsheet className="size-3.5 text-emerald-600" />
          {ATTACHMENT}
        </span>
      </div>
    )}
    {field}
    <div className="flex items-center gap-1">
      <Button aria-label="Добавить" className="size-9 rounded-full" size="icon" type="button" variant="ghost">
        <Plus />
      </Button>
      <div className="flex min-w-0 flex-1 justify-end">{mark}</div>
      <ModelMenu scene={scene} />
      <Button aria-disabled={scene.down} aria-label="Отправить" className={cn("size-9 rounded-full", PRESS, scene.down && "opacity-40")} size="icon" type="button">
        <ArrowUp />
      </Button>
    </div>
  </div>
);

/** 1 · «На месте». */
export const InputFlip = () => {
  const scene = useComposerScene();
  const phone = usePhone();
  const [lens, setLens, can] = useOpen(scene);
  return (
    <ChatShell
      composer={
        <div>
          <style>{LENS_CSS}</style>
          <Pill
            field={<Field lens={lens} onBack={() => setLens(false)} scene={scene} underline />}
            mark={
              can ? (
                <Mark
                  className={cn("h-7 rounded-full px-2", ENTER)}
                  count={scene.hidden.length}
                  label={phone ? undefined : "Так получит модель"}
                  on={lens}
                  onToggle={() => setLens(!lens)}
                  tip={sendTip(scene)}
                />
              ) : (
                <StateNote compact={phone} scene={scene} />
              )
            }
            scene={scene}
          />
          <Hint />
        </div>
      }
    >
      <Earlier />
    </ChatShell>
  );
};

/** 2 · «Над текстом». */
export const InputAbove = () => {
  const scene = useComposerScene();
  const phone = usePhone();
  const [open, setOpen, can] = useOpen(scene);
  // Служба не отвечает — значок раскрывает, почему сообщение не уйдёт.
  const [why, setWhy] = useState(false);
  return (
    <ChatShell
      composer={
        <div>
          <style>{LENS_CSS}</style>
          <Pill
            field={<Field lens={false} onBack={() => {}} scene={scene} underline={false} />}
            mark={
              can ? (
                <Mark
                  className={cn("h-7 rounded-full px-2", ENTER)}
                  count={scene.hidden.length}
                  on={open}
                  onToggle={() => setOpen(!open)}
                  tip={sendTip(scene)}
                />
              ) : scene.down ? (
                <Mark className="h-7 rounded-full px-2" icon={ShieldAlert} on={false} onToggle={() => setWhy(!why)} tip="Защита данных недоступна" />
              ) : (
                <StateNote compact={phone} scene={scene} />
              )
            }
            scene={scene}
            top={
              <Expand open={open || (why && scene.down)}>
                {/* Радиус вложен в радиус поля: 24 − 6. */}
                <div className="bg-background dark:bg-background/60 m-0.5 mb-1.5 max-h-[40dvh] overflow-y-auto rounded-[18px] border px-3.5 pt-2 pb-2.5">
                  {scene.down ? (
                    <Alert className="my-1" variant="destructive">
                      <ShieldAlert />
                      <AlertTitle>Не отправлено: защита данных недоступна</AlertTitle>
                      <AlertDescription>{DOWN}</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="flex h-6 items-center justify-between">
                        <span className="text-muted-foreground text-xs">Так получит модель</span>
                        <Button aria-label="Свернуть" className="text-muted-foreground -mr-1.5" onClick={() => setOpen(false)} size="icon-xs" variant="ghost">
                          <X />
                        </Button>
                      </div>
                      <p className="text-sm leading-6 whitespace-pre-wrap">
                        <Seen lens pieces={scene.draft.pieces} />
                      </p>
                      {scene.att && <AttachmentLine name={ATTACHMENT} sent={false} />}
                    </>
                  )}
                </div>
              </Expand>
            }
          />
          <Hint />
        </div>
      }
    >
      <Earlier />
    </ChatShell>
  );
};
