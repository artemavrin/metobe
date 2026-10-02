"use client";

import { createContext, use, useCallback, useEffect, useRef, useState } from "react";

import { BAD, LIMIT_BYTES, MORE, SAMPLES, accepted, kindOf } from "./data";
import type { Item } from "./data";
import { useProto } from "./state";

// Имитация загрузки: файл сразу после выбора едет «в S3» с прогрессом; слишком большой и неподдерживаемый
// отклоняются тут же; при «обрыве» первый загружаемый файл обрывается на середине и ждёт «повторить». Сообщение,
// отправленное до конца загрузки, держит те же файлы и уходит, когда они догрузятся.

export interface Sent {
  id: string;
  text: string;
  ids: string[];
}

type Engine = {
  items: Record<string, Item>;
  /** Что лежит в композере, по порядку. */
  draft: string[];
  sent: Sent[];
  addFiles: (files: File[]) => void;
  remove: (id: string) => void;
  retry: (id: string) => void;
  send: (text: string) => void;
};

const Ctx = createContext<Engine | null>(null);
export const useEngine = () => {
  const e = use(Ctx);
  if (!e) throw new Error("outside EngineProvider");
  return e;
};

let seq = 0;
const nextId = () => `f${++seq}`;

type Source = { name: string; size: number; pages?: number; preview?: string; file?: File };

const make = (s: Source, uploading: boolean): Item => {
  const base = { id: nextId(), kind: kindOf(s.name), name: s.name, pages: s.pages, preview: s.preview, size: s.size, file: s.file };
  if (s.size > LIMIT_BYTES) return { ...base, problem: "too-big", progress: 0, status: "error" };
  if (!accepted(s.name)) return { ...base, problem: "type", progress: 0, status: "error" };
  return { ...base, progress: uploading ? 0 : 1, status: uploading ? "uploading" : "done" };
};

/** Сколько файлов уже в композере: все, кроме последнего, загружены, последний ещё едет. */
const initial = (count: number) => {
  const pool = [...SAMPLES, ...MORE].slice(0, count);
  return pool.map((s, i) => make(s, i === pool.length - 1));
};

export const EngineProvider = ({ children }: { children: React.ReactNode }) => {
  const { count, breakOne, bad } = useProto();
  const [items, setItems] = useState<Record<string, Item>>(() => Object.fromEntries(initial(count).map((i) => [i.id, i])));
  const [draft, setDraft] = useState<string[]>(() => Object.keys(items));
  const [sent, setSent] = useState<Sent[]>([]);
  // Какой файл оборвётся: первый, что начнёт грузиться при включённом «обрыве».
  const breaking = useRef<string | null>(null);
  const armed = useRef(breakOne);
  useEffect(() => {
    armed.current = breakOne;
    if (breakOne && !breaking.current) {
      breaking.current = Object.values(items).find((i) => i.status === "uploading")?.id ?? null;
    }
  }, [breakOne, items]);

  const put = useCallback((list: Item[]) => {
    setItems((all) => ({ ...all, ...Object.fromEntries(list.map((i) => [i.id, i])) }));
    setDraft((d) => [...d, ...list.map((i) => i.id)]);
    if (armed.current && !breaking.current) {
      breaking.current = list.find((i) => i.status === "uploading")?.id ?? null;
    }
  }, []);

  // «+ большой и .mov» в параметрах.
  const seenBad = useRef(bad);
  useEffect(() => {
    if (bad !== seenBad.current) {
      seenBad.current = bad;
      put(BAD.map((s) => make(s, true)));
    }
  }, [bad, put]);

  // Ход загрузки: ~1,5–3 с на файл, крупные дольше.
  useEffect(() => {
    const timer = setInterval(() => {
      setItems((all) => {
        let changed = false;
        const next = { ...all };
        for (const item of Object.values(all)) {
          if (item.status !== "uploading") continue;
          changed = true;
          const step = 0.04 + Math.random() * 0.06 - Math.min(0.03, item.size / (80 * 1024 * 1024));
          const progress = Math.min(1, item.progress + step);
          if (breaking.current === item.id && progress >= 0.55) {
            next[item.id] = { ...item, problem: "network", progress: 0.55, status: "error" };
            breaking.current = "done";
            continue;
          }
          next[item.id] = progress >= 1 ? { ...item, progress: 1, status: "done" } : { ...item, progress };
        }
        return changed ? next : all;
      });
    }, 120);
    return () => clearInterval(timer);
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      put(
        files.map((file) =>
          make(
            {
              file,
              name: file.name || `скриншот ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}.png`,
              preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
              size: file.size,
            },
            true
          )
        )
      );
    },
    [put]
  );

  const remove = useCallback((id: string) => setDraft((d) => d.filter((x) => x !== id)), []);
  const retry = useCallback(
    (id: string) => setItems((all) => ({ ...all, [id]: { ...all[id], problem: undefined, progress: 0, status: "uploading" } })),
    []
  );

  const send = useCallback(
    (text: string) => {
      // Ошибочные не уходят — остаются в композере, их можно повторить или убрать.
      const going = draft.filter((id) => items[id]?.status !== "error");
      if (!text.trim() && going.length === 0) return;
      setSent((s) => [...s, { id: nextId(), ids: going, text: text.trim() }]);
      setDraft((d) => d.filter((id) => !going.includes(id)));
    },
    [draft, items]
  );

  return <Ctx value={{ addFiles, draft, items, remove, retry, send, sent }}>{children}</Ctx>;
};
