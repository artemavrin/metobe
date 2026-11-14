import "server-only";
import { randomUUID } from "node:crypto";

import type { ChatMessage } from "@metobe/contracts/chat";
import {
  convertToModelMessages,
  readUIMessageStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import type { ModelMessage, StepResult, ToolSet } from "ai";

import { getLanguageModel } from "./ai";
import { setTelegramAppChat, telegramAppChat } from "./channels";
import {
  createChat,
  getChatModel,
  getLastModelIds,
  listChatModelLabels,
  listMessages,
  saveMessages,
} from "./chat";
import type { ChatModel } from "./chat";
import { recordRun, sumUsage } from "./chat-run";
import { STYLE_NOTE } from "./chat-tools/answer-style";
import { CHART_TOOL, chartTool } from "./chat-tools/chart-tool";
import { METRICS_TOOL, metricsTool } from "./chat-tools/metrics-tool";
import { TABLE_TOOL, tableTool } from "./chat-tools/table-tool";
import { TIME_NOTE, TIME_TOOL, timeTool } from "./chat-tools/time-tool";
import { createSources } from "./chat-tools/tool-sources";
import {
  WEB_FETCH,
  WEB_SEARCH,
  webFetchTool,
  webSearchTool,
} from "./chat-tools/web-tools";
import { CHAT_SOURCE } from "./memory";
import { queueMemoryWrite } from "./memory-queue";
import { memoryBrief, memoryShowTools, memoryTools } from "./memory-read";
import { rememberTool } from "./memory-remember";
import { chatMemoryNote, isMemoryOnFor } from "./memory-write";
import { webToolsOn } from "./web-settings";

// Messages to the bot (шаг 7, D43 amended): the person writes to it as to the chat — «напомни завтра в 10 позвонить в
// банк», a question, a forwarded message to remember — and it answers the chat's way: the same model, the memory (its
// block, its tools, its reminders), the time, the web, the widgets drawn as Telegram text. The talk is an ordinary
// chat of the app («Telegram»), so it is seen and continued there, and the memory reads it as any chat's message.
// Not here yet: the mail and the MCP servers — their calls may want a «yes» that Telegram has no place for.

/** How many of the chat's last messages the model reads. */
const CONTEXT = 20;
const MAX_STEPS = 8;
const ANSWER_TIMEOUT_MS = 120_000;
/** Below this window the widgets' schemas are left out, as in the chat. */
const WIDGETS_MIN_WINDOW = 16_000;
/** The chat's name in the app. */
export const TELEGRAM_CHAT_TITLE = "Telegram";

export const TELEGRAM_NOTE = `You answer in Telegram, in the user's chat with the Metobe bot; the user sees the same talk in the app as the chat «Telegram». Write short: a few lines, a list when there are several things, no headings. A table or a chart you show is drawn as text there — keep them small. There are no buttons under what you show: to mark something done or move it, the user tells you, or opens the app. A message that begins «Переслано от» is someone else's text the user forwarded: answer its sense for the user in a line or two.`;

// ── What the bot answers with ───────────────────────────────────────────────────────────────────────────────────────

/** The model the person wrote with last, else the first one in chat; null — the installation has none. */
const modelFor = async (userId: string) => {
  for (const id of await getLastModelIds(userId)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the first that is still in chat
    const model = await getChatModel(id);
    if (model) {
      return model;
    }
  }
  const [first] = await listChatModelLabels();
  return first ? getChatModel(first.id) : null;
};

/** The app's chat of the bot's talk; a new one when there is none (or the person deleted it). */
const appChatOf = async (userId: string) => {
  const known = await telegramAppChat(userId);
  if (known) {
    return known;
  }
  const id = randomUUID();
  await createChat({ id, title: TELEGRAM_CHAT_TITLE, userId });
  await setTelegramAppChat(userId, id);
  return id;
};

/** The memory's block goes in front of the person's last message, as the chat puts it. */
const withBrief = (messages: ModelMessage[], brief: string) => {
  let at = messages.length - 1;
  while (at >= 0 && messages[at]?.role !== "user") {
    at -= 1;
  }
  const last = messages[at];
  if (!brief || !last || last.role !== "user") {
    return messages;
  }
  const content =
    typeof last.content === "string"
      ? [{ text: last.content, type: "text" as const }]
      : last.content;
  return messages.map((m, i) =>
    i === at
      ? {
          ...last,
          content: [{ text: brief, type: "text" as const }, ...content],
        }
      : m
  );
};

const toolsFor = async (
  userId: string,
  model: ChatModel,
  said: { text: string; chatId: string; messageId: string },
  timeZone: string
) => {
  const { text } = said;
  const [memoryOn, web] = await Promise.all([
    isMemoryOnFor(userId),
    webToolsOn(),
  ]);
  if (model.capabilities.tools === false) {
    return { brief: "", note: STYLE_NOTE, tools: {} as ToolSet };
  }
  const sources = createSources([]);
  const room =
    model.contextWindow === null || model.contextWindow >= WIDGETS_MIN_WINDOW;
  const [brief, memoryNote] = memoryOn
    ? await Promise.all([
        memoryBrief(userId, text, timeZone).catch((error: unknown) => {
          console.error("telegram: could not read the memory", error);
          return "";
        }),
        chatMemoryNote(userId),
      ])
    : ["", ""];
  const tools: ToolSet = {
    [TIME_TOOL]: timeTool(timeZone),
    ...(memoryOn
      ? {
          ...memoryTools(userId, timeZone),
          ...memoryShowTools(userId, timeZone),
          ...rememberTool({
            chatId: said.chatId,
            messageId: said.messageId,
            ownerId: userId,
            timeZone,
          }),
        }
      : {}),
    ...(room
      ? {
          [CHART_TOOL]: chartTool(sources),
          [METRICS_TOOL]: metricsTool(sources),
          [TABLE_TOOL]: tableTool(sources),
        }
      : {}),
    ...(web.fetch ? { [WEB_FETCH]: webFetchTool } : {}),
    ...(web.search ? { [WEB_SEARCH]: webSearchTool } : {}),
  };
  return {
    brief,
    note: [TIME_NOTE, STYLE_NOTE, memoryNote, TELEGRAM_NOTE]
      .filter(Boolean)
      .join("\n\n"),
    tools,
  };
};

export class NoChatModelError extends Error {
  constructor() {
    super("no chat model");
    this.name = "NoChatModelError";
  }
}

/**
 * The person's words go into the bot's chat, the model answers them the chat's way, and the answer is kept there too;
 * then the words go to the memory's queue. Answers the chat and the answer as the chat stores it.
 */
export const answerTelegram = async ({
  userId,
  text,
  timeZone,
}: {
  userId: string;
  text: string;
  timeZone: string;
}) => {
  const model = await modelFor(userId);
  if (!model) {
    throw new NoChatModelError();
  }
  const chatId = await appChatOf(userId);
  const question: ChatMessage = {
    id: randomUUID(),
    metadata: { createdAt: new Date().toISOString() },
    parts: [{ text, type: "text" }],
    role: "user",
  };
  await saveMessages(chatId, [question]);
  const [history, { brief, note, tools }, languageModel] = await Promise.all([
    listMessages(chatId),
    toolsFor(userId, model, { chatId, messageId: question.id, text }, timeZone),
    getLanguageModel(model.sourceId, model.modelId),
  ]);
  const messages = withBrief(
    await convertToModelMessages(history.slice(-CONTEXT), { tools }),
    brief
  );
  const started = Date.now();
  let failure: unknown;
  let steps: StepResult<ToolSet>[] = [];
  let answer: ChatMessage | undefined;
  try {
    const result = streamText({
      abortSignal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
      instructions: note,
      messages,
      model: languageModel,
      onError: ({ error }) => {
        failure ??= error;
      },
      providerOptions:
        model.kind === "gateway"
          ? { gateway: { zeroDataRetention: true } }
          : undefined,
      stopWhen: stepCountIs(MAX_STEPS),
      tools,
    });
    const stream = toUIMessageStream<ToolSet, ChatMessage>({
      generateMessageId: () => randomUUID(),
      messageMetadata: ({ part }) =>
        part.type === "start"
          ? { createdAt: new Date().toISOString(), modelId: model.id }
          : undefined,
      stream: result.stream,
    });
    for await (const message of readUIMessageStream<ChatMessage>({
      stream,
    })) {
      answer = message;
    }
    steps = [...(await result.steps)];
  } catch (error) {
    await recordRun({
      chatId,
      latencyMs: null,
      model,
      status: "error",
      userId,
    }).catch(() => null);
    throw failure ?? error;
  }
  if (answer) {
    await saveMessages(chatId, [answer]);
  }
  await recordRun({
    chatId,
    latencyMs: Date.now() - started,
    model,
    status: "ok",
    stepsMetadata: steps.map((s) => s.providerMetadata),
    usage: steps.length > 0 ? sumUsage(steps.map((s) => s.usage)) : undefined,
    userId,
  });
  void queueMemoryWrite({
    chatId,
    ownerId: userId,
    source: CHAT_SOURCE,
    sourceKey: question.id,
    timeZone,
  });
  return { answer, chatId };
};
