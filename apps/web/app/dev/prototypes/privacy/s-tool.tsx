"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { Brain, ChevronRight, Mail, Wrench } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { TOOL_INPUT, TOOL_OUTPUT, mask, uniqueHidden } from "./data";
import { ChatShell, UserBubble } from "./frame";
import { ComposerStub } from "./s-answer";
import { EASE, MaskedText, ShieldCount } from "./parts";

// Сцена «Шаг» (З5, лента шагов). Лента — как `activity.tsx`: строка состояния, шаги с линией слева, время справа.
// У вызова тула две вкладки: «Данные» — что ушло в тул и что вернулось (как сейчас), «Как видела модель» — те же вход
// и результат с метками: модель писала аргументы метками, Metobe подставил значения перед вызовом; результат модель
// получила замаскированным. Организация осталась открытой — так по умолчанию.

const json = (v: unknown) => JSON.stringify(v, null, 2);
const INPUT = json(TOOL_INPUT);
const OUTPUT = json(TOOL_OUTPUT);
const INPUT_MASKED = mask(INPUT).pieces;
const OUTPUT_MASKED = mask(OUTPUT).pieces;
const COUNT = uniqueHidden([...INPUT_MASKED, ...OUTPUT_MASKED]).length;

const Expand = ({ open, children }: { open: boolean; children: ReactNode }) => (
  <div
    className={cn(
      "grid transition-[grid-template-rows,opacity] motion-reduce:[transition-property:opacity]",
      EASE,
      open ? "grid-rows-[1fr] opacity-100 duration-200" : "grid-rows-[0fr] opacity-0 duration-150"
    )}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

const Row = ({ icon, title, time, open, onToggle, children }: { icon: ReactNode; title: string; time: string; open: boolean; onToggle: () => void; children?: ReactNode }) => (
  <div>
    <button
      aria-expanded={open}
      className="hover:bg-muted/60 grid w-full grid-cols-[1.25rem_1fr_auto_0.875rem] items-center gap-2 rounded-md py-1 pr-1 text-left text-sm transition-colors duration-150"
      onClick={onToggle}
      type="button"
    >
      <span className="bg-background text-muted-foreground relative z-10 grid size-5 place-items-center">{icon}</span>
      <span className="text-muted-foreground min-w-0 truncate">{title}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{time}</span>
      <ChevronRight className={cn("text-muted-foreground size-3.5 transition-transform duration-200", EASE, open && "rotate-90")} />
    </button>
    <Expand open={open}>
      <div className="pt-1 pb-2 pl-7">{children}</div>
    </Expand>
  </div>
);

const Block = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="font-medium">{label}</span>
    <div className="bg-muted overflow-auto rounded-md p-2 font-mono">{children}</div>
  </div>
);

const CallTabs = () => (
  <Tabs defaultValue="model">
    <TabsList className="mb-2 h-7" variant="line">
      <TabsTrigger className="text-xs" value="data">
        Данные
      </TabsTrigger>
      <TabsTrigger className="gap-1.5 text-xs" value="model">
        Как видела модель
        <ShieldCount className="text-emerald-600 dark:text-emerald-400" count={COUNT} />
      </TabsTrigger>
    </TabsList>
    <TabsContent className="text-muted-foreground flex flex-col gap-2 text-xs" value="data">
      <Block label="Вход">
        <pre className="whitespace-pre-wrap">{INPUT}</pre>
      </Block>
      <Block label="Результат">
        <pre className="whitespace-pre-wrap">{OUTPUT}</pre>
      </Block>
    </TabsContent>
    <TabsContent className="text-muted-foreground flex flex-col gap-2 text-xs" value="model">
      <Block label="Вход от модели">
        <MaskedText className="leading-5" original={false} pieces={INPUT_MASKED} />
      </Block>
      <Block label="Результат для модели">
        <MaskedText className="leading-5" original={false} pieces={OUTPUT_MASKED} />
      </Block>
    </TabsContent>
  </Tabs>
);

export const ToolScene = () => {
  const [open, setOpen] = useState<Record<string, boolean>>({ crm: true });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  return (
    <ChatShell composer={<ComposerStub />}>
      <UserBubble>Найди контакты Ольги Смирновой и напомни, о чём мы договорились в последнем письме.</UserBubble>
      <section className="flex w-full flex-col">
        <div className="flex w-full items-center gap-2 py-1 text-left text-sm">
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground min-w-0 truncate">Работал 6,2 с · 3 шага</span>
          <ChevronRight className="text-muted-foreground ml-auto size-4 shrink-0 rotate-90" />
        </div>
        <div className="before:bg-border relative pb-2 before:absolute before:top-3 before:bottom-3 before:left-[9px] before:w-px">
          <Row icon={<Brain className="size-3.5" />} onToggle={() => toggle("t")} open={Boolean(open.t)} time="1,1 с" title="Обдумал">
            <p className="text-muted-foreground text-sm italic">Найти контакт в CRM, затем последнее письмо от Ольги Смирновой.</p>
          </Row>
          <Row icon={<Wrench className="size-3.5" />} onToggle={() => toggle("crm")} open={Boolean(open.crm)} time="0,8 с" title="CRM · Найти контакт">
            <CallTabs />
          </Row>
          <Row icon={<Mail className="size-3.5" />} onToggle={() => toggle("mail")} open={Boolean(open.mail)} time="2,3 с" title="Нашёл письма · 3">
            <p className="text-muted-foreground text-xs">Тема: «Поставка на ноябрь» · 12 ноября</p>
          </Row>
        </div>
      </section>
      <p className="text-sm leading-7">
        Ольга Смирнова, менеджер по закупкам ООО «Северный ветер»: +7 916 555-01-23, o.smirnova@example.com. В последнем письме
        договорились перенести поставку на 25 ноября.
      </p>
    </ChatShell>
  );
};
