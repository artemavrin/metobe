"use client";

import { useTranslations } from "next-intl";

import { TaskFigure } from "@/components/tasks/task-figure";

/** The parts of a task, with the dots the draft's card marks them by. */
const PARTS = [
  { dot: "bg-foreground", id: "what" },
  { dot: "bg-sky-500", id: "when" },
  { dot: "bg-violet-500", id: "with" },
  { dot: "bg-emerald-500", id: "where" },
] as const;

/**
 * «Что поручить?» over an empty chat (P11): the conveyor, running, not lit yet — the task has no colour until it is
 * created. Under the title, the four parts a task is made of, marked as the draft's card marks them.
 */
export const TaskIntro = () => {
  const t = useTranslations("tasks.draft");
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <div className="[@media(max-height:600px)]:hidden">
          <TaskFigure className="-mb-2 w-64 sm:w-72" />
        </div>
        <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-[0.22em] uppercase">
          {t("introEyebrow")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t("introTitle")}
        </h1>
        <p className="text-foreground/65 mt-3 max-w-md text-[15px] leading-snug text-balance">
          {t("introText")}
        </p>
        {/* The four parts as stations on a belt, in the card's colours: the line runs behind the dots. */}
        <ol className="relative mt-9 grid w-full max-w-2xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
          <span
            aria-hidden
            className="bg-border absolute top-[5px] right-[12.5%] left-[12.5%] hidden h-px sm:block"
          />
          {PARTS.map((p, i) => (
            <li
              className="animate-in fade-in slide-in-from-bottom-1 relative flex flex-col items-center gap-1.5 duration-300 ease-out motion-reduce:animate-none"
              key={p.id}
              style={{
                animationDelay: `${150 + i * 70}ms`,
                animationFillMode: "both",
              }}
            >
              <span
                aria-hidden
                className={`ring-background mb-1.5 size-2.5 shrink-0 rounded-full ring-4 ${p.dot}`}
              />
              <span className="text-sm font-medium">{t(`parts.${p.id}`)}</span>
              <span className="text-muted-foreground text-xs leading-snug text-balance">
                {t(`hints.${p.id}`)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};
