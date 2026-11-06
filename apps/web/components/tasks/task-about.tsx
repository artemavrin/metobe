"use client";

import { fileIdOf } from "@metobe/contracts/files";
import type { TaskReportWhen } from "@metobe/contracts/tasks";
import type { ChatServer } from "@metobe/core/mcp";
import type { TaskRow } from "@metobe/core/tasks";
import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Play, Undo2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { setTaskNotifyAction } from "@/app/(app)/(chat)/tasks/actions";
import { useAttachments } from "@/components/chat/attachments";
import { Composer } from "@/components/chat/composer";
import type { ComposerHandle } from "@/components/chat/composer";
import { PickerDataProvider } from "@/components/chat/picker/data";
import type { PickerModel } from "@/components/chat/picker/data";
import { useFavorites } from "@/components/chat/picker/use-favorites";
import type { ChatSkill } from "@/components/chat/skill-menu";
import { markAdded } from "@/lib/task-change";

// «О задаче» (P15, D28): what the task does, folded into a line. A change asked in the field under the page opens it:
// in the changed rows the old value is struck through and the new one under it, what is new marked; «Применить»,
// «Тестовый запуск», «Отменить». After a change — «изменена 30 ноя» and «Вернуть как было».

export const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:slide-in-from-bottom-0";
export const PRESS =
  "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

/** A version of the task as the card shows it. */
export interface TaskFields {
  instructions: string;
  /** The task's files by name. */
  files: string[];
  /** The task's skills as `/name`. */
  skills: string[];
  /** The schedule in words. */
  schedule: string;
  /** The sources by title; null — every connection. */
  sources: string[] | null;
  reportWhen: TaskReportWhen;
}

/** A change not applied yet: the version it makes, the person's words, the next run if the schedule changes. */
export interface TaskChangeView {
  after: TaskFields;
  request: string;
  nextAt: Date | null;
}

/** What the card can do with a change; `asked` — the words of a change being prepared. */
export interface ChangeOps {
  asked: string | null;
  busy: boolean;
  changedAt: Date | null;
  handleApply: () => void;
  handleTest: () => void;
  handleCancel: () => void;
  handleRevert: () => void;
  /** The task's model, picked in the composer: applied at once, as a version. */
  handleModel: (modelId: string) => void;
}

const ROW =
  "grid grid-cols-[7rem_1fr] gap-3 py-2.5 text-sm @max-md:grid-cols-1 @max-md:gap-1";

const Field = ({
  label,
  muted = false,
  children,
}: {
  label: string;
  muted?: boolean;
  children: React.ReactNode;
}) => (
  <div className={ROW}>
    <span className="text-muted-foreground">{label}</span>
    <span
      className={cn(
        "min-w-0 break-words whitespace-pre-line",
        muted && "text-muted-foreground"
      )}
    >
      {children}
    </span>
  </div>
);

/** The new value with what is new in it marked; all of it when it is written anew. */
const After = ({ before, after }: { before: string; after: string }) => {
  const marked = markAdded(before, after);
  if (!marked) {
    return <span className="font-medium">{after}</span>;
  }
  return (
    <span className="font-medium">
      {marked.head}
      <mark className="text-foreground rounded bg-emerald-500/15 px-0.5">
        {marked.added}
      </mark>
      {marked.tail}
    </span>
  );
};

/** A row the change touches: the old value struck through, the new one under it. */
const Diff = ({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) => (
  <div className={ROW}>
    <span className="text-muted-foreground">{label}</span>
    <div className="flex min-w-0 flex-col gap-1 break-words whitespace-pre-line">
      <del className="text-muted-foreground decoration-1">{before}</del>
      <After after={after} before={before} />
    </div>
  </div>
);

/** «Уведомления на почту»: on or off, said plainly — each task its own (what goes by mail: ARCH §16.5). */
const Mail = ({ task, onError }: { task: TaskRow; onError: () => void }) => {
  const t = useTranslations("tasks");
  const [mail, setMail] = useState(task.notifyEmail);
  const [, start] = useTransition();
  const toggle = (on: boolean) => {
    setMail(on);
    start(async () => {
      const { ok } = await setTaskNotifyAction(task.id, on);
      if (!ok) {
        setMail(!on);
        onError();
      }
    });
  };
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 py-2.5 text-sm @max-md:grid-cols-1 @max-md:gap-1">
      <span className="text-muted-foreground">{t("fields.mail")}</span>
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className={cn(!mail && "text-muted-foreground")}>
          {mail ? t("mailOn") : t("mailOff")}
        </span>
        <Switch
          aria-label={t("mailLabel")}
          checked={mail}
          onCheckedChange={toggle}
        />
      </label>
    </div>
  );
};

/** The rows a change can touch, as text; files and skills are «Нет» when there are none. */
const useRows = () => {
  const t = useTranslations("tasks");
  const list = (items: string[]) =>
    items.length > 0 ? items.join(", ") : t("none");
  return (f: TaskFields) => [
    { key: "does" as const, value: f.instructions },
    { key: "schedule" as const, value: f.schedule },
    {
      key: "sources" as const,
      value: f.sources ? f.sources.join(", ") : t("allSources"),
    },
    {
      empty: f.files.length === 0,
      key: "files" as const,
      value: list(f.files),
    },
    {
      empty: f.skills.length === 0,
      key: "skills" as const,
      value: list(f.skills),
    },
    { key: "report" as const, value: t(`reportWhen.${f.reportWhen}`) },
  ];
};

const ChangeActions = ({ ops }: { ops: ChangeOps }) => {
  const t = useTranslations("tasks");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        className={PRESS}
        disabled={ops.busy}
        onClick={ops.handleApply}
        size="sm"
      >
        {t("changeApply")}
      </Button>
      <Button
        className={PRESS}
        disabled={ops.busy}
        onClick={ops.handleTest}
        size="sm"
        variant="outline"
      >
        <Play />
        {t("changeTest")}
      </Button>
      <Button
        className={cn("ml-auto", PRESS)}
        disabled={ops.busy}
        onClick={ops.handleCancel}
        size="sm"
        variant="ghost"
      >
        {t("changeCancel")}
      </Button>
    </div>
  );
};

export const About = ({
  task,
  current,
  change,
  ops,
  when,
  modelTitle,
  onError,
}: {
  task: TaskRow;
  /** The task's model by name; it is changed in the composer's picker. */
  modelTitle: string;
  current: TaskFields;
  change: TaskChangeView | null;
  ops: ChangeOps;
  /** A time in the task's zone, in words. */
  when: (at: Date) => string;
  onError: () => void;
}) => {
  const t = useTranslations("tasks");
  const format = useFormatter();
  const rows = useRows();
  const [open, setOpen] = useState(false);
  const editing = change !== null || ops.asked !== null;
  const shown = open || editing;
  const before = rows(current);
  const after = change ? rows(change.after) : null;
  return (
    <section
      className={cn(
        "bg-card rounded-xl border transition-shadow duration-200",
        editing && "ring-foreground/10 ring-2"
      )}
    >
      <button
        aria-expanded={shown}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm"
        disabled={editing}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="text-muted-foreground shrink-0">{t("about")}</span>
        <span className="min-w-0 flex-1 truncate">{current.instructions}</span>
        {ops.changedAt && !editing && (
          <span className="text-muted-foreground shrink-0 text-xs">
            {t("changedAt", {
              date: format.dateTime(ops.changedAt, {
                day: "numeric",
                month: "short",
              }),
            })}
          </span>
        )}
        {!editing && (
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
              shown && "rotate-180"
            )}
          />
        )}
      </button>
      {shown && (
        <div
          className={cn("flex flex-col gap-3 border-t px-4 pt-1 pb-4", ENTER)}
        >
          {editing && (
            <p className="text-muted-foreground pt-2 text-xs">
              {t("changeAsked", {
                request: change?.request ?? ops.asked ?? "",
              })}
            </p>
          )}
          <div className="flex flex-col divide-y">
            {before.map((row, i) => {
              const next = after?.[i];
              const label = t(`fields.${row.key}`);
              // No files or skills before or after: the row is left out.
              if (row.empty && (next === undefined || next.empty)) {
                return null;
              }
              return next !== undefined && next.value !== row.value ? (
                <Diff
                  after={next.value}
                  before={row.value}
                  key={row.key}
                  label={label}
                />
              ) : (
                <Field key={row.key} label={label} muted={change !== null}>
                  {row.value}
                </Field>
              );
            })}
            <Field label={t("fields.model")} muted={change !== null}>
              {modelTitle}
            </Field>
            <Field label={t("fields.created")} muted={change !== null}>
              {format.dateTime(task.createdAt, { dateStyle: "medium" })}
            </Field>
            <Mail onError={onError} task={task} />
          </div>
          {ops.asked !== null && change === null && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner className="size-3.5" />
              {t("changeThinking")}
            </p>
          )}
          {change && (
            <>
              {change.nextAt && (
                <p className="text-muted-foreground text-xs">
                  {t("changeNext", { when: when(change.nextAt) })}
                </p>
              )}
              <ChangeActions ops={ops} />
            </>
          )}
          {!editing && ops.changedAt && (
            <div>
              <Button
                className={PRESS}
                disabled={ops.busy}
                onClick={ops.handleRevert}
                size="sm"
                variant="ghost"
              >
                <Undo2 />
                {t("revert")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

/** What the task's composer is given: the models to pick the task's from, the services and skills to name. */
export interface TaskComposerData {
  picker: { models: PickerModel[]; favorites: string[]; recent: string[] };
  servers: ChatServer[];
  skills: ChatSkill[];
}

/**
 * «Что поменять в задаче…» under the page — the chat's own composer: the picker sets the task's model, a file attached
 * becomes the task's, `@` names a service, `/` a skill. The words come back when nothing was prepared.
 */
export const TaskComposer = ({
  task,
  data,
  busy,
  notice,
  onSend,
  onModel,
}: {
  task: TaskRow;
  data: TaskComposerData;
  /** A change is being prepared: a second request waits. */
  busy: boolean;
  /** Why the last request made no change. */
  notice: string | null;
  onSend: (text: string, fileIds: string[]) => Promise<boolean>;
  onModel: (modelId: string) => void;
}) => {
  const t = useTranslations("tasks");
  const composer = useRef<ComposerHandle>(null);
  const favorites = useFavorites(data.picker.favorites);
  const attachments = useAttachments();
  const [servers, setServers] = useState(data.servers);
  const model =
    data.picker.models.find((m) => m.id === task.modelId) ??
    data.picker.models[0];
  if (!model) {
    return null;
  }
  const send = async (text: string, files: { url: string }[]) => {
    if (busy) {
      return;
    }
    const ids = files.flatMap((f) => fileIdOf(f.url) ?? []);
    if (!(await onSend(text, ids))) {
      composer.current?.say(text);
    }
  };
  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 mt-auto pt-2 pb-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 md:px-6">
        {notice && (
          <output className="text-muted-foreground px-1 text-sm">
            {notice}
          </output>
        )}
        <PickerDataProvider
          models={data.picker.models}
          recent={data.picker.recent}
        >
          <Composer
            attachments={attachments}
            busy={false}
            favorites={favorites}
            model={model}
            onModel={(m) => onModel(m.id)}
            onSend={(text, files) => {
              void send(text, files);
            }}
            onServerReady={(id) =>
              setServers((list) =>
                list.map((s) =>
                  s.id === id ? { ...s, signIn: "ready" as const } : s
                )
              )
            }
            onStop={() => null}
            placeholder={{
              full: t("changePlaceholder"),
              short: t("changePlaceholderShort"),
            }}
            ref={composer}
            servers={servers}
            skills={data.skills}
          />
        </PickerDataProvider>
      </div>
    </div>
  );
};
