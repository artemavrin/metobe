"use client";

import { TooltipProvider } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight, SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";

import { FileChip, Shelf } from "@/components/chat/attachments";
import {
  FileBody,
  FileViewer,
  MadeFileCard,
} from "@/components/chat/file-viewer";
import type { ViewedFile } from "@/components/chat/file-viewer";

import { Picker } from "../_shared/picker";
import { CODE, FILES, OUTPUT, loadMock } from "./data";

// P32–P34 · песочница (D47): как в ответе выглядит шаг «выполнил код», файл, который отдала модель, и где файл
// открывается. «Карточка · окно» — карточки в ответе, файл открывается окном поверх чата (так в приложении);
// «Карточка · панель» — файл открывается панелью справа, рядом с перепиской, со списком файлов чата;
// «Чипы · окно» — первая, минимальная версия: чипы как у вложений.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

/** P32: шаг ленты работы — свёрнут в строку, раскрывается в код и вывод. */
const CodeStep = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="text-sm">
      <button
        className="text-muted-foreground hover:text-foreground flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <SquareTerminal className="size-3.5" />
        Выполнил код
        <span className="tabular-nums">· 1,4 с</span>
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="text-muted-foreground flex flex-col gap-2 pt-2 pl-6 text-xs">
          <span className="font-medium">Код</span>
          <pre className="bg-muted overflow-auto rounded-md p-2 font-mono whitespace-pre-wrap">
            {CODE}
          </pre>
          <span className="font-medium">Вывод</span>
          <pre className="bg-muted overflow-auto rounded-md p-2 font-mono whitespace-pre-wrap">
            {OUTPUT}
          </pre>
        </div>
      )}
    </div>
  );
};

const Question = () => (
  <div className="bg-muted ml-auto max-w-md rounded-2xl px-4 py-2.5 text-sm">
    Посчитай выручку по месяцам из файла и сделай Excel, отчёт и короткую
    презентацию
  </div>
);

const Words = () => (
  <p className="text-sm leading-relaxed">
    Выручка растёт шесть месяцев подряд: с 120 тысяч в январе до 207 тысяч в
    июне. Свёл итоги по месяцам в таблицу, написал отчёт и собрал обзор на
    пять слайдов.
  </p>
);

const Thread = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-10">
    <Question />
    <CodeStep />
    <Words />
    {children}
  </div>
);

const CardWindow = () => {
  const [open, setOpen] = useState<ViewedFile | null>(null);
  return (
    <Thread>
      <div className="flex flex-col gap-2">
        {FILES.map((f) => (
          <MadeFileCard file={f} key={f.id} onOpen={() => setOpen(f)} />
        ))}
      </div>
      <FileViewer file={open} load={loadMock} onClose={() => setOpen(null)} />
    </Thread>
  );
};

const CardPanel = () => {
  const [open, setOpen] = useState<ViewedFile | null>(FILES[0] ?? null);
  return (
    <div className="flex h-dvh">
      <div className="min-w-0 flex-1 overflow-auto">
        <Thread>
          <div className="flex flex-col gap-2">
            {FILES.map((f) => (
              <MadeFileCard file={f} key={f.id} onOpen={() => setOpen(f)} />
            ))}
          </div>
        </Thread>
      </div>
      {open && (
        <aside className="bg-background flex w-[min(44rem,55vw)] flex-col gap-3 border-l p-3 max-md:hidden">
          <div className="flex gap-1 overflow-x-auto">
            {FILES.map((f) => (
              <button
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs whitespace-nowrap",
                  f.id === open.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={f.id}
                onClick={() => setOpen(f)}
                type="button"
              >
                {f.name}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <FileBody file={open} key={open.id} load={loadMock} />
          </div>
        </aside>
      )}
    </div>
  );
};

const ChipsWindow = () => {
  const [open, setOpen] = useState<ViewedFile | null>(null);
  return (
    <Thread>
      <Shelf scroll={false}>
        {FILES.map((f) => (
          <FileChip
            file={{
              key: f.id,
              kind: f.kind,
              name: f.name,
              progress: 1,
              size: f.size,
              status: "done",
            }}
            key={f.id}
            onOpen={() => setOpen(f)}
          />
        ))}
      </Shelf>
      <FileViewer file={open} load={loadMock} onClose={() => setOpen(null)} />
    </Thread>
  );
};

const of = (View: () => React.ReactNode) => () => (
  <Mounted>
    <TooltipProvider delay={300}>
      <View />
    </TooltipProvider>
  </Mounted>
);

const SandboxFilesPrototypePage = () => (
  <Picker
    variants={[
      { Component: of(CardWindow), name: "Карточка · окно" },
      { Component: of(CardPanel), name: "Карточка · панель" },
      { Component: of(ChipsWindow), name: "Чипы · окно" },
    ]}
  />
);

export default SandboxFilesPrototypePage;
