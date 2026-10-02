"use client";

import { createContext, use, useCallback, useEffect, useRef, useState } from "react";

import { ANSWER, BAD, FOLLOW_A, FOLLOW_Q, LIMIT_BYTES, LONG_TEXT, MORE, SAMPLES, SHORT_TEXT, accepted, kindOf } from "./data";
import type { Item } from "./data";
import { useProto } from "./state";

// Движок сцены. Лента: прошлый обмен, правимое сообщение и то, что шло после него. Правка — черновик: текст и файлы
// сообщения (убранный старый файл помечается и его можно вернуть; новый уходит «в хранилище» с прогрессом). «Отправить»
// заменяет сообщение, отбрасывает всё после него и пускает новый ответ; пока файлы догружаются, отправка ждёт их.

export interface Draft extends Item {
  /** Файл сообщения, убранный в этой правке: остаётся в черновике, пока правку не отправят, — его можно вернуть. */
  removed?: boolean;
  /** Добавлен в этой правке. */
  fresh?: boolean;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  files: Item[];
  live?: "preparing" | "streaming";
}

type Engine = {
  turns: Turn[];
  editing: string | null;
  editIndex: number;
  text: string;
  items: Draft[];
  /** Отправка ждёт, пока догрузятся файлы. */
  pending: boolean;
  start: (id: string) => void;
  cancel: () => void;
  setText: (v: string) => void;
  remove: (id: string) => void;
  restore: (id: string) => void;
  addFiles: (files: File[]) => void;
  retry: (id: string) => void;
  send: () => void;
  /** Что изменилось против исходного сообщения. */
  changes: { text: boolean; removed: number; added: number };
};

const Ctx = createContext<Engine | null>(null);
export const useEngine = () => {
  const e = use(Ctx);
  if (!e) throw new Error("outside EngineProvider");
  return e;
};

let seq = 0;
const nextId = () => `e${++seq}`;

type Source = { name: string; size: number; pages?: number; preview?: string; file?: File };

const make = (s: Source, uploading: boolean): Draft => {
  const base = { id: nextId(), kind: kindOf(s.name), name: s.name, pages: s.pages, preview: s.preview, size: s.size, file: s.file };
  if (s.size > LIMIT_BYTES) return { ...base, problem: "too-big", progress: 0, status: "error" };
  if (!accepted(s.name)) return { ...base, problem: "type", progress: 0, status: "error" };
  return { ...base, progress: uploading ? 0 : 1, status: uploading ? "uploading" : "done" };
};

const scene = (count: number, long: boolean, tail: number): Turn[] => {
  const files = [...SAMPLES, ...MORE].slice(0, count).map((s) => make(s, false) as Item);
  const turns: Turn[] = [
    { files: [], id: nextId(), role: "user", text: "Что нужно, чтобы сверить счета с выгрузкой?" },
    { files: [], id: nextId(), role: "assistant", text: "Пришлите счета и выгрузку из 1С — сверю суммы и покажу расхождения. Подойдут PDF, Excel и скриншоты." },
    { files, id: nextId(), role: "user", text: long ? LONG_TEXT : SHORT_TEXT },
    { files: [], id: nextId(), role: "assistant", text: ANSWER },
  ];
  if (tail > 1) {
    turns.push({ files: [], id: nextId(), role: "user", text: FOLLOW_Q }, { files: [], id: nextId(), role: "assistant", text: FOLLOW_A });
  }
  return turns;
};

export const EngineProvider = ({ children }: { children: React.ReactNode }) => {
  const { count, long, tail } = useProto();
  const [turns, setTurns] = useState<Turn[]>(() => scene(count, long, tail));
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [pending, setPending] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const original = turns.find((t) => t.id === editing);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const start = useCallback(
    (id: string) => {
      const turn = turns.find((t) => t.id === id);
      if (!turn) return;
      setEditing(id);
      setText(turn.text);
      setItems(turn.files.map((f) => ({ ...f })));
      setPending(false);
    },
    [turns]
  );

  const drop = useCallback((list: Draft[]) => {
    for (const i of list) if (i.fresh && i.preview?.startsWith("blob:")) URL.revokeObjectURL(i.preview);
  }, []);

  const cancel = useCallback(() => {
    drop(items);
    setEditing(null);
    setPending(false);
  }, [drop, items]);

  // Ход загрузки новых файлов.
  useEffect(() => {
    if (!items.some((i) => i.status === "uploading")) return;
    const timer = setInterval(() => {
      setItems((all) =>
        all.map((item) => {
          if (item.status !== "uploading") return item;
          const progress = Math.min(1, item.progress + 0.05 + Math.random() * 0.06);
          return progress >= 1 ? { ...item, progress: 1, status: "done" } : { ...item, progress };
        })
      );
    }, 120);
    return () => clearInterval(timer);
  }, [items]);

  const addFiles = useCallback((files: File[]) => {
    setItems((all) => [
      ...all,
      ...files.map((file) => ({
        ...make(
          {
            file,
            name: file.name || "скриншот.png",
            preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
            size: file.size,
          },
          true
        ),
        fresh: true,
      })),
    ]);
  }, []);

  // «+ большой и .mov» в параметрах появляется и тут: проверить отказ при правке.
  const { bad } = useProto();
  const seenBad = useRef(bad);
  useEffect(() => {
    if (bad === seenBad.current) return;
    seenBad.current = bad;
    if (editing) setItems((all) => [...all, ...BAD.map((s) => ({ ...make(s, true), fresh: true }))]);
  }, [bad, editing]);

  const remove = useCallback(
    (id: string) =>
      setItems((all) => {
        const item = all.find((i) => i.id === id);
        if (!item) return all;
        // Новый файл уходит насовсем; старый только помечается — вернуть можно до отправки.
        if (item.fresh) {
          drop([item]);
          return all.filter((i) => i.id !== id);
        }
        return all.map((i) => (i.id === id ? { ...i, removed: true } : i));
      }),
    [drop]
  );
  const restore = useCallback((id: string) => setItems((all) => all.map((i) => (i.id === id ? { ...i, removed: false } : i))), []);
  const retry = useCallback(
    (id: string) => setItems((all) => all.map((i) => (i.id === id ? { ...i, problem: undefined, progress: 0, status: "uploading" } : i))),
    []
  );

  const going = items.filter((i) => !i.removed && i.status !== "error");
  const uploading = going.some((i) => i.status === "uploading");

  const finish = useCallback(() => {
    if (!editing) return;
    const id = editing;
    setTurns((all) => {
      const at = all.findIndex((t) => t.id === id);
      const head = all.slice(0, at);
      const edited: Turn = { files: going.map(({ fresh: _f, removed: _r, ...rest }) => rest), id, role: "user", text: text.trim() };
      return [...head, edited, { files: [], id: nextId(), live: "preparing", role: "assistant", text: "" }];
    });
    setEditing(null);
    setPending(false);
    // Новый ответ: «готовит ответ…», затем слова.
    const words = ANSWER.match(/\S+\s*/gu) ?? [];
    timers.current.push(
      setTimeout(() => {
        let n = 0;
        const tick = () => {
          n += 1;
          setTurns((all) =>
            all.map((t, i) =>
              i === all.length - 1 && t.role === "assistant"
                ? { ...t, live: n >= words.length ? undefined : "streaming", text: words.slice(0, n).join("") }
                : t
            )
          );
          if (n < words.length) timers.current.push(setTimeout(tick, 28));
        };
        tick();
      }, 1100)
    );
  }, [editing, going, text]);

  const send = useCallback(() => {
    if (!text.trim() && going.length === 0) return;
    if (uploading) {
      setPending(true);
      return;
    }
    finish();
  }, [finish, going.length, text, uploading]);

  // Файлы догрузились — ждавшая правка уходит.
  useEffect(() => {
    if (pending && !uploading) finish();
  }, [finish, pending, uploading]);

  const changes = {
    added: items.filter((i) => i.fresh && !i.removed && i.status !== "error").length,
    removed: items.filter((i) => i.removed).length,
    text: !!original && text.trim() !== original.text.trim(),
  };

  return (
    <Ctx
      value={{
        addFiles,
        cancel,
        changes,
        editIndex: turns.findIndex((t) => t.id === editing),
        editing,
        items,
        pending,
        remove,
        restore,
        retry,
        send,
        setText,
        start,
        text,
        turns,
      }}
    >
      {children}
    </Ctx>
  );
};
