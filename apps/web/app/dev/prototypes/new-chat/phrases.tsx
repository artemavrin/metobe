"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";

// The line of the day: under the greeting of a new chat, a short warm thought about the work — quiet, never a poster;
// a new one for every new chat. The space is in the picture; in words it is only beyond the black hole's horizon, in a
// few lines about rest (the facts there are checked: the universe ≈ 13.8 billion years old; half the Earth is always
// in the dark).

/**
 * A short warm line about the work, nothing more: the sky is in the picture, not in the words (a comparison with space
 * in every line read as pulled in by the ears). Nothing tied to a country or a product it connects to.
 */
const WORK: Record<"ru" | "en", string[]> = {
  en: [
    "The hardest part is the first question.",
    "A precise question saves an hour of searching.",
    "A big task is easier step by step.",
    "Don't keep it all in your head — ask.",
    "Numbers make more sense when you can see them.",
    "A good answer starts with a good question.",
    "A small fix today saves a week tomorrow.",
    "Decisions hold up better on data than on guesses.",
    "Get one important thing done today.",
    "A break is part of the work, too.",
    "You don't need the answer — just the question.",
    "A long document doesn't have to be read end to end.",
  ],
  ru: [
    "Самое трудное — первый вопрос.",
    "Точный вопрос экономит час поиска.",
    "Большую задачу проще решать по шагам.",
    "Не держите всё в голове — спросите.",
    "Цифры понятнее, когда их видно.",
    "Хороший ответ начинается с хорошего вопроса.",
    "Маленькая правка сегодня экономит неделю завтра.",
    "Решения надёжнее на данных, чем на догадках.",
    "Сделайте сегодня одну важную вещь.",
    "Перерыв — тоже часть работы.",
    "Не обязательно знать ответ — достаточно спросить.",
    "Длинный документ не обязательно читать целиком.",
  ],
};

export interface RestLine {
  head: [string, string];
  lines: [string, string, string];
}

const REST: Record<"ru" | "en", RestLine[]> = {
  en: [
    {
      head: ["You can't get it all done.", "And you don't have to."],
      lines: ["The to-do list will never end, but this evening will.", "Even stars don't rush — they burn for billions of years.", "Take a break. What matters will wait for you."],
    },
    {
      head: ["Even Earth", "needs the night."],
      lines: ["Every day, half the planet is in the dark.", "And every morning still comes on time.", "Close the laptop. Tomorrow brings a new sunrise."],
    },
    {
      head: ["The universe isn't in a hurry.", "You don't have to be either."],
      lines: ["It's 13.8 billion years old and still a work in progress.", "The best of it came together slowly.", "Rest — your tasks won't fly away."],
    },
    {
      head: ["Stars shine for ages", "because they don't burn out in a day."],
      lines: ["Pace beats a sprint.", "Breathe out, make some tea, look out the window.", "Come back — and it'll all go faster."],
    },
  ],
  ru: [
    {
      head: ["Всё успеть невозможно.", "И не нужно."],
      lines: ["Список дел не кончится никогда, а этот вечер — да.", "Даже звёзды не спешат — они горят миллиарды лет.", "Сделайте паузу. Всё важное дождётся вас."],
    },
    {
      head: ["Даже Земле", "нужна ночь."],
      lines: ["Половину каждых суток планета проводит в темноте.", "И каждое утро всё равно наступает вовремя.", "Закройте ноутбук. Завтра будет новый рассвет."],
    },
    {
      head: ["Вселенная не спешит.", "Вам тоже можно."],
      lines: ["Ей 13,8 миллиарда лет, и она всё ещё в процессе.", "Лучшее в ней складывалось медленно.", "Отдохните — задачи никуда не улетят."],
    },
    {
      head: ["Звёзды горят веками,", "потому что не сгорают за день."],
      lines: ["Темп важнее рывка.", "Выдохните, налейте чаю, посмотрите в окно.", "Вернётесь — и всё пойдёт быстрее."],
    },
  ],
};

/** The far side's own labels. */
const BEYOND_LABELS = {
  en: { back: "New chat", eyebrow: "Beyond the event horizon" },
  ru: { back: "Новый чат", eyebrow: "За горизонтом событий" },
};

const lang = (locale: string) => (locale.startsWith("ru") ? "ru" : "en");

/** The line of the day and the lines about rest in the user's language. */
export const useWorkPhrases = () => WORK[lang(useLocale())];
export const useRestLines = () => REST[lang(useLocale())];
export const useBeyondLabels = () => BEYOND_LABELS[lang(useLocale())];

/** One of the list, picked after mount (the server and the browser draw the same first frame). */
export const usePick = <T,>(list: T[]) => {
  const [item, setItem] = useState<T | null>(null);
  useEffect(() => setItem(list[Math.floor(Math.random() * list.length)] ?? null), [list]);
  return item;
};

const PHRASE_CSS = `
@keyframes phrase-rise { from { opacity: 0; filter: blur(6px); transform: translateY(6px); } }
.phrase-rise { animation: phrase-rise 700ms cubic-bezier(0.23, 1, 0.32, 1) 250ms backwards; }
@media (prefers-reduced-motion: reduce) { @keyframes phrase-rise { from { opacity: 0; } } }
/* The date goes over the greeting as its eyebrow, the way «За горизонтом событий» sits over the far side's head:
   small spaced caps, quiet. The greeting stays the one big thing; the line of the day follows it. */
.date-eyebrow { order: -1; margin: 0 0 10px; font-size: 11px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; }
`;

/**
 * The line of the day, set under the greeting, and the date moved over it as an eyebrow: the welcome is the product's
 * own, so the line goes in through a portal and the date is moved by a class.
 */
export const PhraseUnderDate = ({ welcome }: { welcome: RefObject<HTMLDivElement | null> }) => {
  const phrase = usePick(useWorkPhrases());
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const date = welcome.current?.querySelector("h1")?.nextElementSibling;
    if (!date) return;
    const el = document.createElement("div");
    date.after(el);
    date.classList.add("date-eyebrow");
    setSlot(el);
    return () => {
      el.remove();
      date.classList.remove("date-eyebrow");
    };
  }, [welcome]);
  if (!slot || !phrase) return null;
  return createPortal(
    <>
      <style>{PHRASE_CSS}</style>
      {/* Its own line under the greeting, in the interface's face, quiet but readable. */}
      <p className="phrase-rise text-foreground/65 mx-auto mt-3 max-w-lg text-center text-[15px] leading-snug text-balance">
        {phrase}
      </p>
    </>,
    slot
  );
};
