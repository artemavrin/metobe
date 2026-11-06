"use client";

import { TASK_COLORS, colorForTask } from "@metobe/contracts/tasks";
import type { TaskDraftOutput } from "@metobe/contracts/tasks";
import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowRight, Check, Pencil } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { createContext, use, useMemo, useState, useTransition } from "react";

import { createTaskAction } from "@/app/(app)/(chat)/tasks/actions";
import { TaskFigure } from "@/components/tasks/task-figure";
import type { TaskDraftPart } from "@/lib/answer-work";
import { clock } from "@/lib/task-runs";

// A task drafted in the chat (ARCH §16.1, P11): what the model understood in four rows — what, when, from where, where
// the results go — with the conveyor beside them. What is not known yet stays a dash, the one being asked says so. Once
// all is there, the person names it, picks its colour and creates it; the card then says it is created and leads to
// its page. Only the chat's latest draft is live: an earlier one is a line.

const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:slide-in-from-bottom-0";
const PRESS =
  "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

export interface TaskChat {
  chatId: string;
  /** The task set up in this chat, once created. */
  created: { id: string; name: string; color: string } | null;
  /** The chat's latest draft: the only live card. */
  latest: string | null;
  onCreated: (task: { id: string; name: string; color: string }) => void;
}

/** Given by the chat the person owns; a shared chat's reader gets none and sees the card without its buttons. */
export const TaskChatContext = createContext<TaskChat | null>(null);

type Ok = Extract<TaskDraftOutput, { ok: true }>;

const Row = ({
  dot,
  label,
  children,
}: {
  dot: string | null;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3 py-2.5">
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full transition-colors duration-300",
          dot ?? "bg-border"
        )}
      />
      {label}
    </span>
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1.5 text-sm",
        !dot && "text-muted-foreground"
      )}
    >
      {children}
    </div>
  </div>
);

const useFirst = (out: Ok | null) => {
  const format = useFormatter();
  const locale = useLocale();
  const first = out?.next[0];
  if (!first) {
    return null;
  }
  const at = new Date(first);
  const date = format.dateTime(at, {
    day: "numeric",
    month: "short",
    timeZone: out.timeZone,
    weekday: "short",
  });
  return `${date}, ${clock(at, out.timeZone, locale)}`;
};

const When = ({ out }: { out: Ok | null }) => {
  const t = useTranslations("tasks");
  const first = useFirst(out);
  const when = out?.schedule ?? null;
  const asking = out !== null && when === null;
  return (
    <Row dot={when ? "bg-sky-500" : null} label={t("draft.slots.when")}>
      {when ? (
        <>
          <span>{when}</span>
          {first && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {t("draft.first", { when: first })}
            </span>
          )}
        </>
      ) : (
        <span className={cn(asking && "text-foreground")}>
          {asking ? t("draft.notSet") : "—"}
        </span>
      )}
    </Row>
  );
};

const From = ({ out }: { out: Ok | null }) => {
  const t = useTranslations("tasks");
  return (
    <Row dot={out ? "bg-violet-500" : null} label={t("draft.slots.with")}>
      {out?.sources ? (
        out.sources.map((s) => (
          <span
            className="bg-muted/60 inline-flex h-7 items-center rounded-full px-2.5 text-[0.8rem]"
            key={s.id}
          >
            {s.title}
          </span>
        ))
      ) : (
        <span>{out ? t("allSources") : "—"}</span>
      )}
    </Row>
  );
};

const Where = ({ input }: { input: TaskDraftPart["input"] }) => {
  const t = useTranslations("tasks");
  if (!input?.reportWhen) {
    return (
      <Row dot={null} label={t("draft.slots.where")}>
        —
      </Row>
    );
  }
  const when =
    input.reportWhen === "always"
      ? t("draft.whereAlways")
      : t("draft.whereChanges");
  const to = input.email ? t("draft.whereMail") : t("draft.wherePage");
  return (
    <Row dot="bg-emerald-500" label={t("draft.slots.where")}>
      <span>
        {when} — {to}
      </span>
    </Row>
  );
};

const Rows = ({ part, out }: { part: TaskDraftPart; out: Ok | null }) => {
  const t = useTranslations("tasks");
  const { input } = part;
  return (
    <div className="flex min-w-0 flex-1 flex-col divide-y px-4">
      <Row
        dot={input?.instructions ? "bg-foreground" : null}
        label={t("draft.slots.what")}
      >
        <span className="line-clamp-3">{input?.instructions ?? "—"}</span>
      </Row>
      <When out={out} />
      <From out={out} />
      <Where input={input} />
    </div>
  );
};

/** The name and colour, then «Создать задачу». */
const Naming = ({ part, chat }: { part: TaskDraftPart; chat: TaskChat }) => {
  const t = useTranslations("tasks");
  const [name, setName] = useState(part.input?.name ?? "");
  const [color, setColor] = useState(() =>
    colorForTask(part.input?.name ?? "")
  );
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const create = () =>
    start(async () => {
      setFailed(false);
      const result = await createTaskAction({
        chatId: chat.chatId,
        color,
        name,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        toolCallId: part.toolCallId,
      });
      if (result.ok) {
        chat.onCreated({ color, id: result.id, name: name.trim() });
      } else {
        setFailed(true);
      }
    });
  return (
    <div className={cn("flex flex-col gap-3 border-t px-4 py-3.5", ENTER)}>
      <div className="flex items-center gap-3">
        <span
          className="size-2.5 shrink-0 rounded-full transition-colors duration-300"
          style={{ background: color }}
        />
        <label className="focus-within:border-ring/60 flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1 transition-colors duration-150 @max-md:min-h-11">
          <input
            aria-invalid={!name.trim() || undefined}
            aria-label={t("draft.nameLabel")}
            className="min-w-0 flex-1 bg-transparent font-medium outline-none"
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
          <Pencil
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex flex-wrap items-center gap-1.5 @max-md:gap-2.5">
          <legend className="sr-only">{t("draft.colorLabel")}</legend>
          {TASK_COLORS.map((c, i) => (
            <label className="relative" key={c}>
              <input
                aria-label={t("draft.color", { n: i + 1 })}
                checked={c === color}
                className="peer sr-only"
                name="task-color"
                onChange={() => setColor(c)}
                type="radio"
              />
              <span
                className="ring-offset-card peer-focus-visible:outline-ring block size-5 cursor-pointer rounded-full ring-offset-2 transition-[box-shadow,transform] duration-150 peer-checked:ring-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 active:scale-90 @max-md:size-8"
                style={
                  { "--tw-ring-color": c, background: c } as React.CSSProperties
                }
              />
            </label>
          ))}
        </fieldset>
        <Button
          className={cn("ml-auto", PRESS)}
          disabled={!name.trim() || pending}
          onClick={create}
          size="sm"
        >
          {pending && <Spinner />}
          {pending ? t("draft.creating") : t("draft.create")}
        </Button>
      </div>
      {failed && (
        <p className="text-destructive text-xs" role="alert">
          {t("draft.createFailed")}
        </p>
      )}
    </div>
  );
};

const Created = ({
  task,
  out,
}: {
  task: { id: string; name: string; color: string };
  out: Ok | null;
}) => {
  const t = useTranslations("tasks");
  const first = useFirst(out);
  return (
    <div className={cn("flex flex-col gap-2 border-t px-4 py-3.5", ENTER)}>
      <div className="flex items-center gap-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: task.color }}
        />
        <span className="min-w-0 flex-1 truncate font-medium">{task.name}</span>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Check className="size-3.5" />
          {t("draft.created")}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {first && (
          <span className="text-muted-foreground min-w-0 flex-1 text-xs">
            {t("draft.createdNote", { when: first })}
          </span>
        )}
        <Link
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs transition-colors duration-150 @max-md:min-h-11"
          href={`/tasks/${task.id}`}
        >
          {t("draft.open")}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
};

export const TaskDraftCard = ({ part }: { part: TaskDraftPart }) => {
  const t = useTranslations("tasks");
  const chat = use(TaskChatContext);
  // A cron the server could not read went back to the model, which drafts again: nothing to show for it.
  if (
    part.state === "output-error" ||
    (part.state === "output-available" && !part.output.ok)
  ) {
    return null;
  }
  const out =
    part.state === "output-available" && part.output.ok ? part.output : null;
  if (chat && chat.latest !== null && chat.latest !== part.toolCallId) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="bg-border size-1.5 rounded-full" />
        {part.input?.name ? `${part.input.name} · ` : ""}
        {t("draft.older")}
      </p>
    );
  }
  const created = chat?.created ?? null;
  const complete = out !== null && out.schedule !== null;
  return (
    <div
      className={cn(
        "bg-card @container flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-xs",
        ENTER
      )}
    >
      <div className="flex flex-col @lg:flex-row">
        <div className="bg-muted/30 flex shrink-0 items-center justify-center border-b @lg:w-60 @lg:border-r @lg:border-b-0">
          <TaskFigure
            className="w-56"
            color={created?.color}
            running={created !== null}
          />
        </div>
        <Rows out={out} part={part} />
      </div>
      {created && <Created out={out} task={created} />}
      {!created && complete && chat && <Naming chat={chat} part={part} />}
    </div>
  );
};

/** The chat's latest draft: the toolCallId of the last `draft_task` in it, or null. */
export const lastDraftId = (messages: { parts: { type: string }[] }[]) => {
  let id: string | null = null;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "tool-draft_task" && "toolCallId" in p) {
        id = String(p.toolCallId);
      }
    }
  }
  return id;
};

/** The chat's task for its cards: the one created here (at once, without a reload), its latest draft, the intent. */
export const useTaskChat = (
  chatId: string,
  task: { created: TaskChat["created"]; intent?: boolean } | undefined,
  messages: { parts: { type: string }[] }[]
) => {
  const [created, setCreated] = useState(task?.created ?? null);
  const latest = lastDraftId(messages);
  const taskChat = useMemo<TaskChat>(
    () => ({ chatId, created, latest, onCreated: setCreated }),
    [chatId, created, latest]
  );
  const t = useTranslations("tasks.draft");
  const intent = task?.intent && !created;
  return {
    taskChat,
    taskIntent: intent ? ("task" as const) : undefined,
    /** «Опишите задачу…» while the chat sets up a task. */
    taskPlaceholder: intent
      ? { full: t("placeholder"), short: t("placeholderShort") }
      : undefined,
  };
};
