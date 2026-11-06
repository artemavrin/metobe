import "server-only";
import { randomUUID } from "node:crypto";

import type { ChatMessage } from "@metobe/contracts/chat";
import { fileUrl } from "@metobe/contracts/files";
import { taskReportSchema } from "@metobe/contracts/tasks";
import type { TaskReport, TaskSnapshot } from "@metobe/contracts/tasks";
import {
  convertToModelMessages,
  hasToolCall,
  readUIMessageStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
} from "ai";
import type { LanguageModel, ModelMessage, StepResult, ToolSet } from "ai";

import { getLanguageModel } from "./ai";
import { filePartsFor, readsPdf } from "./attachments";
import { createChat, getChatModel, listMessages, saveMessages } from "./chat";
import type { ChatModel } from "./chat";
import { recordRun, sumUsage } from "./chat-run";
import { STYLE_NOTE } from "./chat-tools/answer-style";
import {
  ATTACHMENT_NOTE,
  READ_ATTACHMENT,
  readAttachmentTool,
} from "./chat-tools/attachment-tool";
import { CHART_TOOL, chartTool } from "./chat-tools/chart-tool";
import { emailTools } from "./chat-tools/email-tools";
import { METRICS_TOOL, metricsTool } from "./chat-tools/metrics-tool";
import { SAVE_SKILL, skillsOfChat } from "./chat-tools/skill-tools";
import { TABLE_TOOL, tableTool } from "./chat-tools/table-tool";
import { TIME_NOTE, TIME_TOOL, timeTool } from "./chat-tools/time-tool";
import { lendTools, servicesNote } from "./chat-tools/tool-search";
import { createSources, shareResults } from "./chat-tools/tool-sources";
import {
  WEB_FETCH,
  WEB_SEARCH,
  webFetchTool,
  webSearchTool,
} from "./chat-tools/web-tools";
import { filesOf } from "./files";
import { listMailboxes } from "./mailboxes";
import { listChatServers, toolsForUser } from "./mcp";
import { getPersonalPolicy } from "./personal";
import { skillsByIds, skillsForChat } from "./skills";
import { sendRunLetter } from "./task-mail";
import {
  announceRun,
  finishRun,
  getRunContext,
  lastResultChat,
  markRunning,
  pauseRun,
} from "./tasks";
import { webToolsOn } from "./web-settings";

// One run of a periodic task (ARCH §16.2): an ordinary chat of kind `task_run` with the owner's tools, which must end
// with `report({ outcome, summary })`. The run uses the version it was queued with, the model of that version, and
// the owner's connections (all of them unless the task names some, D22). The previous result goes into the
// instructions, so «only when something changed» can be judged. Errors end the run as failed with a reason a person
// can read; a missing model or connection is an action for the person, not a failure.
//
// The run gets the tools the chat has (chat-tools, shared with the chat route): the owner's servers — a big one's
// tools on demand — the table, metrics and chart widgets, the time, the web as the admin left it, and the owner's
// mail. Not the ones that need the person at hand: asking a question (that is `report` with outcome question),
// reading a thread's files, «connect X» (that is outcome action). A tool that waits for the person's yes (mail, a
// server tool set to «ask») ends the run as an action for now; going on after the yes comes with editing (stage 3).

const REPORT = "report";

type Task = NonNullable<Awaited<ReturnType<typeof getRunContext>>>["task"];
type Steps = StepResult<ToolSet>[];

const textOf = (message: ChatMessage | undefined) =>
  (message?.parts ?? [])
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim();

/** The first sentence of an answer: what a run without `report` is summed up with. */
const firstLine = (message: ChatMessage | undefined) => {
  const line =
    textOf(message)
      .split(/(?<=[.!?])\s|\n/u)[0]
      ?.trim() ?? "";
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
};

/** The text of a chat's last answer — the previous result the run compares with. */
const lastAnswer = async (chatId: string | null) => {
  if (!chatId) {
    return null;
  }
  const messages = await listMessages(chatId);
  const text = textOf(messages.findLast((m) => m.role === "assistant"));
  return text ? text.slice(0, 6000) : null;
};

const dateIn = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(at);

const instructionsFor = (
  task: Task,
  snapshot: TaskSnapshot,
  at: Date,
  previous: string | null,
  note: string
) =>
  [
    note,
    `Ты выполняешь периодическую задачу «${task.name}». Это не разговор: человека рядом нет, отвечай итогом для него.`,
    `Инструкция задачи:\n${snapshot.instructions}`,
    `Сейчас: ${dateIn(at, snapshot.timezone)} (${snapshot.timezone}).`,
    previous
      ? `Итог прошлого запуска — сравнивай с ним:\n${previous}`
      : "Это первый запуск: сравнивать не с чем; опиши текущее состояние.",
    "Если человек отклонил вызов тула — не вызывай его снова и не ищи обхода: вызови report с outcome news и summary о том, что действие отклонено.",
    "Итог пиши сухо и точно: что нашёл, с цифрами; без приветствий и без «я». Не начинай с заголовка с названием задачи и датой — они уже есть на странице. Источники не перечисляй: страница показывает их под итогом сама.",
    snapshot.reportWhen === "changes"
      ? "Если с прошлого запуска ничего не изменилось — итог не пиши, вызови report с outcome quiet."
      : "Итог пиши после каждого запуска, даже если нового нет.",
    `Сначала напиши итог текстом — это то, что человек прочитает на странице задачи и в письме; таблицы и списки — в markdown. Потом, последним шагом, вызови ${REPORT}: outcome и summary — итог одной строкой. При outcome quiet текст не нужен. Если нужен ответ человека — outcome question; если человек должен что-то сделать (войти, подключить, дать доступ) — outcome action.`,
  ].join("\n\n");

/** A model with a smaller window gets no widget tools: their schemas take about 3,000 tokens (as in the chat). */
const WIDGETS_MIN_WINDOW = 16_000;

/** The run's tools — the chat's own and the owner's servers (the task's catalog items, or all, D22) — `report`, and the notes that go with them. */
const toolsFor = async (
  task: Task,
  snapshot: TaskSnapshot,
  model: ChatModel,
  chatId: string,
  reported: { value: TaskReport | null }
) => {
  const report = tool({
    description:
      "Ends the run: what it came to and the result in one line. Call it once, last.",
    execute: (input) => {
      reported.value = input;
      return { ok: true };
    },
    inputSchema: taskReportSchema,
  });
  if (model.capabilities.tools === false) {
    return { note: STYLE_NOTE, tools: { [REPORT]: report } as ToolSet };
  }
  const [chatServers, ownBoxes, personal, web, owned, picked] =
    await Promise.all([
      listChatServers(task.ownerId),
      listMailboxes(task.ownerId),
      getPersonalPolicy(),
      webToolsOn(),
      skillsForChat(task.ownerId),
      skillsByIds(task.ownerId, snapshot.skillIds ?? []),
    ]);
  // The task's skills are picked for every run, as `/name` picks them in a chat; the rest are offered by description.
  // A run writes no skills of its own.
  const skilled = skillsOfChat({
    chatId,
    question: picked.map((k) => `/${k.name}`).join(" "),
    skills: owned,
    tools: true,
    userId: task.ownerId,
    vision: model.capabilities.vision === true,
  });
  const { [SAVE_SKILL]: _save, ...skillTools } = skilled.tools;
  const hasFiles = (snapshot.fileIds ?? []).length > 0;
  const usable = chatServers.map((s) => s.id);
  const catalogIds = snapshot.catalogIds
    ? usable.filter((id) => snapshot.catalogIds?.includes(id))
    : usable;
  const servers = await toolsForUser(task.ownerId, catalogIds);
  // What the servers' tools return, kept whole for the widgets: a table `from` a result takes its rows from here.
  const sources = createSources([]);
  const room =
    model.contextWindow === null || model.contextWindow >= WIDGETS_MIN_WINDOW;
  const boxes = personal.mode === "off" ? [] : ownBoxes;
  const tools: ToolSet = {
    ...lendTools(
      servers.map((server) => ({
        ...server,
        tools: shareResults(server.tools, sources),
      })),
      new Set()
    ),
    ...(room
      ? {
          [CHART_TOOL]: chartTool(sources),
          [METRICS_TOOL]: metricsTool(sources),
          [TABLE_TOOL]: tableTool(sources),
        }
      : {}),
    [TIME_TOOL]: timeTool(snapshot.timezone),
    ...skillTools,
    ...(hasFiles
      ? { [READ_ATTACHMENT]: readAttachmentTool(task.ownerId, chatId) }
      : {}),
    ...(web.fetch ? { [WEB_FETCH]: webFetchTool } : {}),
    ...(web.search ? { [WEB_SEARCH]: webSearchTool } : {}),
    ...(boxes.length > 0
      ? emailTools(task.ownerId, boxes, personal.approvals)
      : {}),
    [REPORT]: report,
  };
  return {
    note: [
      TIME_NOTE,
      STYLE_NOTE,
      hasFiles ? ATTACHMENT_NOTE : "",
      skilled.note,
      servicesNote(servers),
    ]
      .filter(Boolean)
      .join("\n\n"),
    tools,
  };
};

/** A tool call in the answer that waits for the person's yes: the run cannot go on without them. */
const waitingCall = (answer: ChatMessage | undefined) =>
  (answer?.parts ?? []).find(
    (p) => "state" in p && p.state === "approval-requested"
  );

interface Pass {
  languageModel: LanguageModel;
  modelId: string;
  instructions: string;
  signal: AbortSignal;
}

/** The work: the model with the tools until `report` or the step limit; the answer as the chat stores it. */
/** How often the answer on its way is written down, at most: the task's page shows it while the run goes. */
const PROGRESS_MS = 1500;

/**
 * Writes the answer on its way, now and then: a write is skipped while one is in flight or one was made a moment ago —
 * the next comes with a later state. `done` waits for the last one, so it never lands over the final answer.
 */
const progressWriter = (save: (answer: ChatMessage) => Promise<void>) => {
  let busy: Promise<void> | null = null;
  let last = 0;
  return {
    done: async () => {
      await busy;
    },
    push: (answer: ChatMessage) => {
      if (busy || Date.now() - last < PROGRESS_MS) {
        return;
      }
      last = Date.now();
      busy = (async () => {
        try {
          await save(answer);
        } catch (error) {
          console.error("tasks: progress", error);
        } finally {
          busy = null;
        }
      })();
    },
  };
};

const work = async (
  p: Pass,
  messages: ModelMessage[],
  tools: ToolSet,
  maxSteps: number,
  onProgress: (answer: ChatMessage) => Promise<void>,
  /** Going on after the person's answer: the run's chat so far, and its answer to carry on. */
  from?: { history: ChatMessage[]; answer: ChatMessage }
) => {
  // A stream's error goes to `onError`, and the result then rejects with «No output generated»: the run is to say
  // the first one — the provider's own reason.
  let failure: unknown;
  const result = streamText({
    abortSignal: p.signal,
    instructions: p.instructions,
    messages,
    model: p.languageModel,
    onError: ({ error }) => {
      failure ??= error;
    },
    stopWhen: [stepCountIs(maxSteps), hasToolCall(REPORT)],
    tools,
  });
  let answer: ChatMessage | undefined;
  const stream = toUIMessageStream<ToolSet, ChatMessage>({
    // The messages table keys by uuid: the answer gets one of its own.
    generateMessageId: () => randomUUID(),
    // Going on: the stream carries on the same answer, so the approved call gets its result where it was asked.
    ...(from ? { originalMessages: from.history } : {}),
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? { createdAt: new Date().toISOString(), modelId: p.modelId }
        : undefined,
    sendReasoning: true,
    stream: result.stream,
  });
  try {
    const progress = progressWriter(onProgress);
    for await (const message of readUIMessageStream<ChatMessage>({
      message: from?.answer,
      stream,
    })) {
      answer = message;
      progress.push(message);
    }
    await progress.done();
    const steps: Steps = [...(await result.steps)];
    const response = await result.response;
    return { answer, response, steps };
  } catch (error) {
    throw failure ?? error;
  }
};

/**
 * A model may call `report` without a word of the result (cheap ones do): the person would see only the line. As the
 * chat does when the work ends silent (lib/sum-up), one more pass without tools writes the result.
 */
const writeUp = async (
  p: Pass,
  history: Awaited<ReturnType<typeof work>>["response"]["messages"],
  summary: string
) => {
  const pass = streamText({
    abortSignal: p.signal,
    instructions: p.instructions,
    messages: [
      ...history,
      {
        content: `Напиши итог для человека текстом: что нашёл, с цифрами. Итог одной строкой был: «${summary}». Без вызова тулов.`,
        role: "user",
      },
    ],
    model: p.languageModel,
  });
  const text = await pass.text;
  const steps = await pass.steps;
  return { steps, text: text.trim() };
};

/**
 * How a finished run ends: waiting for the person's yes on a call (the task waits for them), what `report` said, or
 * — when the model forgot it — a result summed up by its first sentence.
 */
/** «Ждёт подтверждения: email_send» — the run stops there, not over (pauseRun). */
const waitingSummary = (answer: ChatMessage | undefined) => {
  const waiting = waitingCall(answer);
  if (!waiting) {
    return null;
  }
  const name =
    waiting.type === "dynamic-tool"
      ? waiting.toolName
      : waiting.type.replace(/^tool-/u, "");
  return `Ждёт подтверждения: ${name}`;
};

const endOf = (answer: ChatMessage | undefined, report: TaskReport | null) => {
  const end = report ?? {
    outcome: "news" as const,
    summary: firstLine(answer) || "Запуск завершён без итога",
  };
  return {
    outcome: end.outcome,
    status: "done" as const,
    summary: end.summary,
  };
};

/** Why a run did not end, in words a person can read. */
const reasonOf = (error: unknown, aborted: boolean, timeoutS: number) => {
  if (aborted) {
    return "Запуск остановлен";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return `Запуск не уложился в ${Math.round(timeoutS / 60)} мин`;
  }
  return error instanceof Error
    ? error.message.slice(0, 300)
    : "Неизвестная ошибка";
};

/**
 * The run's first message: the line with the time and the task's own files (ARCH §16.1a). The chat keeps the files as
 * links to them; the model gets what it can read of each, as a chat's model does.
 */
const askOf = async (
  task: Task,
  snapshot: TaskSnapshot,
  model: ChatModel,
  first: { ask: string; at: Date }
) => {
  const fileIds = snapshot.fileIds ?? [];
  const [rows, readable] = await Promise.all([
    filesOf(task.ownerId, fileIds),
    filePartsFor(task.ownerId, fileIds, {
      pdf: readsPdf(model.kind, model.modelId),
      tools: model.capabilities.tools !== false,
      vision: model.capabilities.vision,
    }),
  ]);
  const text = { text: first.ask, type: "text" as const };
  const question: ChatMessage = {
    id: randomUUID(),
    metadata: { createdAt: first.at.toISOString() },
    parts: [
      text,
      ...rows.map((r) => ({
        filename: r.name,
        mediaType: r.mediaType,
        type: "file" as const,
        url: fileUrl(r.id),
      })),
    ],
    role: "user",
  };
  const messages =
    readable.length > 0
      ? await convertToModelMessages([
          { ...question, parts: [text, ...readable] },
        ])
      : [{ content: first.ask, role: "user" as const }];
  return { messages, question };
};

type Context = NonNullable<Awaited<ReturnType<typeof getRunContext>>>;

/**
 * Before the work (ARCH §16.2, step 2): a service the task names that waits for the owner's own sign-in, or that only
 * the admin can sign in to. The run ends there as an action for the person — with the way to put it right — instead
 * of failing on the way. A task with every service (no list) is not checked: it may not need the missing one.
 */
const accessGap = async (ctx: Context) => {
  const named = ctx.snapshot.catalogIds;
  if (!named || named.length === 0) {
    return null;
  }
  const servers = await listChatServers(ctx.task.ownerId);
  // A named service the owner may not use any more: turned off, or closed to them by the admin.
  if (!named.some((id) => servers.some((s) => s.id === id))) {
    return {
      fix: null,
      summary:
        "Нет доступа к источникам задачи: они отключены или закрыты администратором",
    };
  }
  const gap = servers.find((s) => named.includes(s.id) && s.signIn !== "ready");
  if (!gap) {
    return null;
  }
  return gap.signIn === "self"
    ? {
        fix: { id: gap.id, kind: "server" as const },
        summary: `Нет доступа к ${gap.title}: нужен вход`,
      }
    : {
        fix: null,
        summary: `Нет доступа к ${gap.title}: вход настраивает администратор`,
      };
};

/** After the work: a mail tool that failed on a mailbox's password — the box waits to be connected again. */
const mailGap = async (ownerId: string, answer: ChatMessage | undefined) => {
  const failed = (answer?.parts ?? []).some(
    (p) =>
      p.type === "dynamic-tool" &&
      p.toolName.startsWith("email_") &&
      p.state === "output-error"
  );
  if (!failed) {
    return null;
  }
  const boxes = await listMailboxes(ownerId);
  const box = boxes.find((b) => b.status === "needs_reauth");
  return box
    ? {
        fix: { id: box.id, kind: "mailbox" as const },
        summary: `Нет доступа к почте ${box.address}: нужен вход`,
      }
    : null;
};

/**
 * The run's work to its end, or to a tool that waits for the person's yes — then it stops (pauseRun) and goes on
 * later from the same answer (resumeRun). Never throws: whatever happens, the run row says how it ended.
 */
const carry = async (c: {
  ctx: Context;
  model: ChatModel;
  chatId: string;
  question: ChatMessage;
  messages: ModelMessage[];
  from?: { history: ChatMessage[]; answer: ChatMessage };
  signal?: AbortSignal;
}) => {
  const { run, task, snapshot } = c.ctx;
  const runId = run.id;
  const { chatId, model, question } = c;
  const started = Date.now();
  const timeout = AbortSignal.timeout(task.timeoutS * 1000);
  const record = (status: "ok" | "error" | "aborted", steps: Steps = []) =>
    recordRun({
      chatId,
      latencyMs: Date.now() - started,
      model,
      purpose: "task",
      status,
      stepsMetadata: steps.map((s) => s.providerMetadata),
      usage: steps.length > 0 ? sumUsage(steps.map((s) => s.usage)) : undefined,
      userId: task.ownerId,
    });
  try {
    const last = await lastResultChat(task.id, runId);
    const previous = await lastAnswer(last?.chatId ?? null);
    const reported: { value: TaskReport | null } = { value: null };
    const { note, tools } = await toolsFor(
      task,
      snapshot,
      model,
      chatId,
      reported
    );
    const pass: Pass = {
      instructions: instructionsFor(
        task,
        snapshot,
        run.scheduledFor,
        previous,
        note
      ),
      languageModel: await getLanguageModel(model.sourceId, model.modelId),
      modelId: model.id,
      signal: c.signal ? AbortSignal.any([c.signal, timeout]) : timeout,
    };
    const done = await work(
      pass,
      c.messages,
      tools,
      task.maxSteps,
      async (going) => {
        await saveMessages(chatId, [question, going]);
        await announceRun(runId);
      },
      c.from
    );
    let { answer } = done;
    const steps = [...done.steps];
    const report = reported.value;
    if (answer && report && report.outcome !== "quiet" && !textOf(answer)) {
      const written = await writeUp(
        pass,
        done.response.messages,
        report.summary
      );
      steps.push(...written.steps);
      if (written.text) {
        answer = {
          ...answer,
          parts: [...answer.parts, { text: written.text, type: "text" }],
        };
      }
    }
    await saveMessages(chatId, answer ? [question, answer] : [question]);
    await record("ok", steps);
    const waiting = waitingSummary(answer);
    const gap = waiting ? null : await mailGap(task.ownerId, answer);
    if (waiting) {
      await pauseRun(runId, waiting);
    } else if (gap) {
      await finishRun(runId, { ...gap, outcome: "action", status: "done" });
    } else {
      await finishRun(runId, endOf(answer, report));
    }
    await sendRunLetter(runId);
  } catch (error) {
    const aborted = c.signal?.aborted ?? false;
    await record(aborted ? "aborted" : "error").catch((recordError: unknown) =>
      console.error("tasks: record run", recordError)
    );
    await finishRun(runId, {
      error: reasonOf(error, aborted, task.timeoutS),
      status: aborted ? "cancelled" : "failed",
    });
    await sendRunLetter(runId);
  }
};

/** A run's model, or the run ends as an action for the person: the model is gone. */
const modelOrEnd = async (ctx: Context) => {
  const model = await getChatModel(ctx.snapshot.modelId);
  if (!model) {
    await finishRun(ctx.run.id, {
      outcome: "action",
      status: "done",
      summary: "Модель задачи недоступна: выбрана другая или источник выключен",
    });
    await sendRunLetter(ctx.run.id);
  }
  return model;
};

/** Runs a queued run to its end, or to a tool that waits for the person's yes. */
export const executeRun = async (runId: string, signal?: AbortSignal) => {
  const ctx = await getRunContext(runId);
  if (!ctx || ctx.run.status !== "queued") {
    return;
  }
  const model = await modelOrEnd(ctx);
  if (!model) {
    return;
  }
  const gap = await accessGap(ctx);
  if (gap) {
    await finishRun(runId, { ...gap, outcome: "action", status: "done" });
    await sendRunLetter(runId);
    return;
  }
  const { run, task, snapshot } = ctx;
  const chatId = randomUUID();
  const at = run.scheduledFor;
  await createChat({
    id: chatId,
    kind: "task_run",
    title: `${task.name} · ${dateIn(at, snapshot.timezone)}`,
    userId: task.ownerId,
  });
  await markRunning(runId, chatId);
  const { question, messages } = await askOf(task, snapshot, model, {
    ask: `Запуск задачи: ${dateIn(at, snapshot.timezone)}.`,
    at: new Date(),
  });
  // The run's chat fills as it goes: the page shows its steps while it runs (ARCH §16.4).
  await saveMessages(chatId, [question]);
  await carry({ chatId, ctx, messages, model, question, signal });
};

/**
 * A run stopped at a tool that waited for the person's yes goes on, once every such call has its answer: the same
 * chat, the same answer — an approved call runs first, a refused one tells the model so — on to the end.
 */
export const resumeRun = async (runId: string, signal?: AbortSignal) => {
  const ctx = await getRunContext(runId);
  const chatId = ctx?.run.chatId;
  if (!ctx || ctx.run.status !== "waiting_approval" || !chatId) {
    return;
  }
  const history = await listMessages(chatId);
  const question = history.find((m) => m.role === "user");
  // The latest answer: the chat holds the question and the one answer that stopped.
  const answer = history.findLast((m) => m.role === "assistant");
  if (!(question && answer) || waitingCall(answer)) {
    return;
  }
  const model = await modelOrEnd(ctx);
  if (!model) {
    return;
  }
  await markRunning(runId, chatId);
  // The first message as the model reads it (the task's files too), then the answer with the person's decisions.
  const first = await askOf(ctx.task, ctx.snapshot, model, {
    ask: textOf(question),
    at: new Date(),
  });
  const messages = [
    ...first.messages,
    ...(await convertToModelMessages([answer])),
  ];
  await carry({
    chatId,
    ctx,
    from: { answer, history: [question, answer] },
    messages,
    model,
    question,
    signal,
  });
};
