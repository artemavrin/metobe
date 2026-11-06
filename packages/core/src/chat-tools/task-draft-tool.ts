import {
  MAIL_SOURCE,
  WEB_SOURCE,
  taskDraftSchema,
} from "@metobe/contracts/tasks";
import type { TaskDraft, TaskDraftOutput } from "@metobe/contracts/tasks";
import { tool } from "ai";
import type { Tool, ToolSet } from "ai";

import {
  MIN_GAP_MINUTES,
  isTooFrequent,
  isValidSchedule,
  nextRuns,
  scheduleWords,
} from "../task-schedule";

// A periodic task set up in words (ARCH §16.1, P11): the model fills a draft of what it understood, the answer draws it
// as a card, the person creates the task from it. The model proposes the cron; the schedule in words and the next runs
// are counted here — date arithmetic is not the model's.

export const TASK_DRAFT_TOOL = "draft_task";

/** How many next runs the card is given. */
const NEXT = 3;

/** For every chat that has no task yet: when to draft one. */
export const TASK_NOTE = `When the person asks for something to be done regularly — every morning, on Mondays, each week — offer it as a periodic task: call ${TASK_DRAFT_TOOL} with what you understood; the answer shows it as a card and the person creates the task there. Ask for what is missing in words, one thing at a time (most often: when), and call ${TASK_DRAFT_TOOL} again with the answer. Do not do the work itself now unless asked. Speak of the task plainly, as of a program: what it does and when — not as of someone who waits, keeps quiet or decides.`;

/** «Что поручить?»: the person came to set up a task. */
export const TASK_INTENT_NOTE = `The person is setting up a periodic task: whatever they write is what the task should do. Call ${TASK_DRAFT_TOOL} at once with what you understood, then ask for what is missing, one thing at a time.`;

export interface DraftServer {
  id: string;
  key: string;
  title: string;
}

/** How a model may name the mail and the web among the sources: shown, though neither is a catalog server. */
const BUILT_IN = [
  {
    id: MAIL_SOURCE,
    names: new Set(["mail", "email", "e-mail", "почта", "inbox"]),
    title: { en: "Mail", ru: "Почта" },
  },
  {
    id: WEB_SOURCE,
    names: new Set([
      "web",
      "internet",
      "websites",
      "интернет",
      "сайты",
      "web_fetch",
      "web_search",
    ]),
    title: { en: "Websites", ru: "Сайты" },
  },
];

export const sourcesOf = (
  names: string[] | null,
  servers: DraftServer[],
  locale: "ru" | "en"
) => {
  if (!names || names.length === 0) {
    return null;
  }
  const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
  const found = servers
    .filter(
      (s) =>
        wanted.has(s.key.toLowerCase()) || wanted.has(s.title.toLowerCase())
    )
    .map((s) => ({ id: s.id, title: s.title }));
  for (const b of BUILT_IN) {
    if ([...wanted].some((n) => b.names.has(n))) {
      found.push({ id: b.id, title: b.title[locale] });
    }
  }
  return found.length > 0 ? found : null;
};

/** What the server makes of a draft: the schedule checked and said in words, the first runs counted. */
export const readDraft = (
  draft: TaskDraft,
  ctx: { timeZone: string; servers: DraftServer[]; locale: "ru" | "en" },
  now = new Date()
): TaskDraftOutput => {
  const cron = draft.cron?.trim() || null;
  if (cron && !isValidSchedule(cron, ctx.timeZone)) {
    return {
      error: `«${cron}» is not a cron of five fields; give it as minute hour day month weekday.`,
      ok: false,
    };
  }
  if (cron && isTooFrequent(cron)) {
    return {
      error: `«${cron}» runs more often than every ${MIN_GAP_MINUTES} minutes, and a task runs at most every ${MIN_GAP_MINUTES} minutes. Tell the person so and offer every ${MIN_GAP_MINUTES} minutes or less often.`,
      ok: false,
    };
  }
  return {
    next: cron
      ? nextRuns(cron, ctx.timeZone, now, NEXT).map((d) => d.toISOString())
      : [],
    ok: true,
    schedule: cron ? scheduleWords(cron, ctx.locale) : null,
    sources: sourcesOf(draft.sources, ctx.servers, ctx.locale),
    timeZone: ctx.timeZone,
  };
};

export const taskDraftTool = (ctx: {
  timeZone: string;
  servers: DraftServer[];
  locale: "ru" | "en";
}): Tool<TaskDraft, TaskDraftOutput> =>
  tool({
    description: `Drafts a periodic task from what the person said: what it does, when, from where, when to report. Shown to the person as a card they create the task from. Call again with the whole draft whenever they add or change something. A task runs at most every ${MIN_GAP_MINUTES} minutes.`,
    execute: (draft) => readDraft(draft, ctx),
    inputSchema: taskDraftSchema,
  });

/**
 * The chat's part of tasks: the draft tool and its note while the chat has no task (one chat — one task), with the
 * intent's note on top when the chat came from «Что поручить?».
 */
export const taskDraftFor = (
  ctx: { timeZone: string; servers: DraftServer[]; locale: "ru" | "en" },
  chat: { hasTask: boolean; intent: boolean; tools: boolean }
): { note: string; tools: ToolSet } => {
  if (chat.hasTask || !chat.tools) {
    return { note: "", tools: {} };
  }
  return {
    note: chat.intent ? `${TASK_NOTE}\n\n${TASK_INTENT_NOTE}` : TASK_NOTE,
    tools: { [TASK_DRAFT_TOOL]: taskDraftTool(ctx) },
  };
};
