import "server-only";
import { randomUUID } from "node:crypto";

import type { ChatMessage } from "@metobe/contracts/chat";
import { taskReportSchema } from "@metobe/contracts/tasks";
import type { TaskReport, TaskSnapshot } from "@metobe/contracts/tasks";
import {
  hasToolCall,
  readUIMessageStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
} from "ai";
import type { LanguageModel, StepResult, ToolSet } from "ai";

import { getLanguageModel } from "./ai";
import { createChat, getChatModel, listMessages, saveMessages } from "./chat";
import type { ChatModel } from "./chat";
import { recordRun, sumUsage } from "./chat-run";
import { listChatServers, toolsForUser } from "./mcp";
import { finishRun, getRunContext, lastResultChat, markRunning } from "./tasks";

// One run of a periodic task (ARCH §16.2): an ordinary chat of kind `task_run` with the owner's tools, which must end
// with `report({ outcome, summary })`. The run uses the version it was queued with, the model of that version, and
// the owner's connections (all of them unless the task names some, D22). The previous result goes into the
// instructions, so «only when something changed» can be judged. Errors end the run as failed with a reason a person
// can read; a missing model or connection is an action for the person, not a failure.
//
// Stage 1 of the tasks (PLAN v2): the run gets the MCP tools; the chat's own tools (widgets, the web, mail, the time)
// come when their assembly moves out of the chat route into core.

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
  previous: string | null
) =>
  [
    `Ты выполняешь периодическую задачу «${task.name}». Это не разговор: человека рядом нет, отвечай итогом для него.`,
    `Инструкция задачи:\n${snapshot.instructions}`,
    `Сейчас: ${dateIn(at, snapshot.timezone)} (${snapshot.timezone}).`,
    previous
      ? `Итог прошлого запуска — сравнивай с ним:\n${previous}`
      : "Это первый запуск: сравнивать не с чем; опиши текущее состояние.",
    "Итог пиши сухо и точно: что нашёл, с цифрами и источниками; без приветствий и без «я».",
    snapshot.reportWhen === "changes"
      ? "Если с прошлого запуска ничего не изменилось — итог не пиши, вызови report с outcome quiet."
      : "Итог пиши после каждого запуска, даже если нового нет.",
    `Сначала напиши итог текстом — это то, что человек прочитает на странице задачи и в письме; таблицы и списки — в markdown. Потом, последним шагом, вызови ${REPORT}: outcome и summary — итог одной строкой. При outcome quiet текст не нужен. Если нужен ответ человека — outcome question; если человек должен что-то сделать (войти, подключить, дать доступ) — outcome action.`,
  ].join("\n\n");

/** The owner's tools for the run — the task's catalog items, or all the owner can use — and `report`. */
const toolsFor = async (
  task: Task,
  snapshot: TaskSnapshot,
  model: ChatModel,
  reported: { value: TaskReport | null }
): Promise<ToolSet> => {
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
    return { [REPORT]: report };
  }
  const servers = await listChatServers(task.ownerId);
  const usable = servers.map((s) => s.id);
  const catalogIds = snapshot.catalogIds
    ? usable.filter((id) => snapshot.catalogIds?.includes(id))
    : usable;
  const sets = await toolsForUser(task.ownerId, catalogIds);
  return {
    ...Object.assign({}, ...sets.map((s) => s.tools)),
    [REPORT]: report,
  };
};

interface Pass {
  languageModel: LanguageModel;
  modelId: string;
  instructions: string;
  signal: AbortSignal;
}

/** The work: the model with the tools until `report` or the step limit; the answer as the chat stores it. */
const work = async (p: Pass, ask: string, tools: ToolSet, maxSteps: number) => {
  const result = streamText({
    abortSignal: p.signal,
    instructions: p.instructions,
    messages: [{ content: ask, role: "user" }],
    model: p.languageModel,
    stopWhen: [stepCountIs(maxSteps), hasToolCall(REPORT)],
    tools,
  });
  let answer: ChatMessage | undefined;
  const stream = toUIMessageStream<ToolSet, ChatMessage>({
    // The messages table keys by uuid: the answer gets one of its own.
    generateMessageId: () => randomUUID(),
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? { createdAt: new Date().toISOString(), modelId: p.modelId }
        : undefined,
    sendReasoning: true,
    stream: result.stream,
  });
  for await (const message of readUIMessageStream<ChatMessage>({ stream })) {
    answer = message;
  }
  const steps: Steps = [...(await result.steps)];
  const response = await result.response;
  return { answer, response, steps };
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

/** Runs a queued run to its end. Never throws: whatever happens, the run row says how it ended. */
export const executeRun = async (runId: string, signal?: AbortSignal) => {
  const ctx = await getRunContext(runId);
  if (!ctx || ctx.run.status !== "queued") {
    return;
  }
  const { run, task, snapshot } = ctx;
  const model = await getChatModel(snapshot.modelId);
  if (!model) {
    await finishRun(runId, {
      outcome: "action",
      status: "done",
      summary: "Модель задачи недоступна: выбрана другая или источник выключен",
    });
    return;
  }

  const chatId = randomUUID();
  const at = run.scheduledFor;
  await createChat({
    id: chatId,
    kind: "task_run",
    title: `${task.name} · ${dateIn(at, snapshot.timezone)}`,
    userId: task.ownerId,
  });
  await markRunning(runId, chatId);

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
    const tools = await toolsFor(task, snapshot, model, reported);
    const pass: Pass = {
      instructions: instructionsFor(task, snapshot, at, previous),
      languageModel: await getLanguageModel(model.sourceId, model.modelId),
      modelId: model.id,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    };
    const ask = `Запуск задачи: ${dateIn(at, snapshot.timezone)}.`;
    const done = await work(pass, ask, tools, task.maxSteps);
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
    const question: ChatMessage = {
      id: randomUUID(),
      metadata: { createdAt: new Date(started).toISOString() },
      parts: [{ text: ask, type: "text" }],
      role: "user",
    };
    await saveMessages(chatId, answer ? [question, answer] : [question]);
    await record("ok", steps);
    // A run that forgot `report` still has its answer: a result, summed up by its first sentence.
    const end = report ?? {
      outcome: "news" as const,
      summary: firstLine(answer) || "Запуск завершён без итога",
    };
    await finishRun(runId, {
      outcome: end.outcome,
      status: "done",
      summary: end.summary,
    });
  } catch (error) {
    const aborted = signal?.aborted ?? false;
    await record(aborted ? "aborted" : "error").catch((recordError: unknown) =>
      console.error("tasks: record run", recordError)
    );
    await finishRun(runId, {
      error: reasonOf(error, aborted, task.timeoutS),
      status: aborted ? "cancelled" : "failed",
    });
  }
};
