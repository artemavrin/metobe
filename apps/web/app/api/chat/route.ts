import {
  chatMessageMetadataSchema,
  chatRequestSchema,
  chatTitleFrom,
} from "@metobe/contracts/chat";
import type {
  Approvals,
  ChatErrorCode,
  ChatMessage,
} from "@metobe/contracts/chat";
import { getInstructions } from "@metobe/core/account";
import { getLanguageModel } from "@metobe/core/ai";
import {
  createChat,
  deleteMessagesFrom,
  getChat,
  getChatModel,
  listMessages,
  saveMessages,
} from "@metobe/core/chat";
import { recordRun, sumUsage, withPromptCache } from "@metobe/core/chat-run";
import { generateChatTitle } from "@metobe/core/chat-title";
import { listMailboxes } from "@metobe/core/mailboxes";
import { listChatServers, toolsForUser } from "@metobe/core/mcp";
import type { ChatServer } from "@metobe/core/mcp";
import { webToolsOn } from "@metobe/core/web-settings";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import type { ToolSet, UIMessageChunk } from "ai";
import { headers } from "next/headers";

import { applyApprovals, applyConnections, settleAsks } from "@/lib/approvals";
import { getAuth } from "@/lib/auth";
import { CHART_TOOL, chartTool } from "@/lib/chart-tool";
import {
  MAIL_KEY,
  REQUEST_CONNECTION,
  requestConnectionTool,
} from "@/lib/connect-tool";
import { budgetMessages, isContextOverflow } from "@/lib/context-budget";
import { emailTools } from "@/lib/email-tools";
import { endGeneration, startGeneration } from "@/lib/generations";
import { mentionedIn } from "@/lib/mentions";
import { getPrefs } from "@/lib/prefs";
import { recordStream } from "@/lib/resume-stream";
import { MAX_STEPS, lastStepAnswers } from "@/lib/steps";
import { TABLE_TOOL, tableTool } from "@/lib/table-tool";
import { TIME_NOTE, TIME_TOOL, timeTool } from "@/lib/time-tool";
import { lendTools, servicesNote } from "@/lib/tool-search";
import { withNotes } from "@/lib/user-notes";
import {
  WEB_FETCH,
  WEB_SEARCH,
  webFetchTool,
  webSearchTool,
} from "@/lib/web-tools";

// POST /api/chat (ARCH §6), after vercel/chatbot: the client sends only its newest message — or its answers to
// the last answer's approvals — and the history comes from the database. The user's message is saved before the model is called, the answer when the stream ends —
// even if the client has gone by then. Errors are codes; the chat screen says them in the user's language.
// Every call is recorded in model_runs with its cache split; prompt caching per source is in core/chat-run.
// Tools (M4), stop, resume and statuses (M3.2) come on their steps.

export const maxDuration = 300;

const fail = (code: ChatErrorCode, status: number) =>
  Response.json({ error: code }, { status });

/** Chunks that mean the model has started answering. */
const FIRST_TOKEN = new Set([
  "text-delta",
  "reasoning-delta",
  "tool-call",
  "tool-input-start",
]);

/**
 * Why a call failed, as «name: message» down the cause chain (a retry's last error first) — where the real reason
 * is, like a proxy that does not resolve. The request itself stays out of the log: it holds the prompt.
 */
const causes = (error: unknown) => {
  const chain: string[] = [];
  let current: unknown = (error as { lastError?: unknown }).lastError ?? error;
  while (current instanceof Error && chain.length < 6) {
    const status = (current as { statusCode?: number }).statusCode;
    chain.push(
      `${current.name}: ${current.message}${status ? ` (${status})` : ""}`
    );
    current = current.cause;
  }
  return chain.join(" ← ");
};

const textOf = (message: ChatMessage) =>
  message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ");

const provisionalTitle = (message: ChatMessage) =>
  chatTitleFrom(textOf(message));

/**
 * A new question: the same message again (a retry, an edit) drops itself and what followed, then goes anew.
 */
/** What a request makes of the chat: the messages the model gets, the one to save, and where to cut first. */
interface Prepared {
  messages: ChatMessage[];
  save: ChatMessage[];
  dropFrom?: string;
}

const askAnew = (stored: ChatMessage[], message: ChatMessage): Prepared => {
  const again = stored.findIndex((m) => m.id === message.id);
  const before = again === -1 ? stored : stored.slice(0, again);
  // An ask for a connection the user passed by with this question: «not connected», saved so.
  const last = before.at(-1);
  const settled = last?.role === "assistant" ? settleAsks(last) : last;
  const changed = settled && settled !== last ? [settled] : [];
  return {
    dropFrom: again === -1 ? undefined : message.id,
    messages: [
      ...before.slice(0, changed.length ? -1 : undefined),
      ...changed,
      message,
    ],
    save: [...changed, message],
  };
};

/**
 * The user's answers to the last answer's approvals and «connect X to go on», applied to the server's copy; null
 * when they fit nothing. Whether a server is connected is the server's to say (`connected`), not the client's.
 */
const applyToLast = (
  stored: ChatMessage[],
  connected: (server: string) => boolean,
  approvals?: Approvals
): Prepared | null => {
  const last = stored.at(-1);
  if (
    !approvals ||
    last?.role !== "assistant" ||
    last.id !== approvals.messageId
  ) {
    return null;
  }
  const approved = approvals.answers.length
    ? applyApprovals(last, approvals.answers)
    : last;
  const answered =
    approved && approvals.connections.length
      ? applyConnections(approved, approvals.connections, connected)
      : approved;
  return answered && answered !== last
    ? { messages: [...stored.slice(0, -1), answered], save: [answered] }
    : null;
};

/**
 * The MCP servers whose tools the model gets: those the thread's questions mention (`@Title`, read as the thread
 * draws its badges), and those the user connected when an answer asked. A server stays on while a question that
 * names it is in the thread — an edited or dropped question takes its servers along.
 */
const serversOf = (servers: ChatServer[], thread: ChatMessage[]) => {
  const mentioned = mentionedIn(
    thread.flatMap((m) =>
      m.role === "user"
        ? m.parts.flatMap((p) => (p.type === "text" ? [p.text] : []))
        : []
    ),
    servers
  );
  const asked = new Set(
    thread.flatMap((m) =>
      m.parts.flatMap((p) =>
        p.type === "tool-request_connection" &&
        p.state === "output-available" &&
        p.output.connected
          ? [p.input.server]
          : []
      )
    )
  );
  return [
    ...new Set([
      ...mentioned,
      ...servers.filter((s) => asked.has(s.key)).map((s) => s.id),
    ]),
  ];
};

/** The MCP tools the thread has called: a big server loads them at once for the next question. */
const calledIn = (thread: ChatMessage[]) =>
  new Set(
    thread.flatMap((m) =>
      m.parts.flatMap((p) => (p.type === "dynamic-tool" ? [p.toolName] : []))
    )
  );

export const POST = async (request: Request) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return fail("unauthorized", 401);
  }
  const body = chatRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) {
    return fail("bad-request", 400);
  }
  const { id, message, modelId } = body.data;

  const chat = await getChat(id);
  if (chat && chat.userId !== session.user.id) {
    return fail("forbidden", 403);
  }
  // The user's own zone (their choice, else the browser's): the clock the model asks tells the time in it.
  const { timeZone } = await getPrefs();
  const [stored, chatServers, boxes, notes] = await Promise.all([
    chat ? listMessages(id) : [],
    listChatServers(session.user.id),
    listMailboxes(session.user.id),
    getInstructions(session.user.id),
  ]);
  const ready = (key: string) =>
    key === MAIL_KEY
      ? boxes.length > 0
      : chatServers.some((s) => s.key === key && s.signIn === "ready");
  const prepared = message
    ? askAnew(stored, message)
    : applyToLast(stored, ready, body.data.approvals);
  if (!prepared) {
    return fail("bad-request", 400);
  }
  // A new question goes to the chip's model; an answer carried on after approvals, to the model that asked.
  const answerModel = modelId ?? stored.at(-1)?.metadata?.modelId;
  const model = answerModel ? await getChatModel(answerModel) : null;
  if (!model) {
    return fail("model-unavailable", 422);
  }

  let languageModel: Awaited<ReturnType<typeof getLanguageModel>>;
  try {
    languageModel = await getLanguageModel(model.sourceId, model.modelId);
  } catch (error) {
    console.error("chat: could not build the model", model.id, error);
    return fail("model-unavailable", 422);
  }

  // Checked before anything is written, so a history that does not validate leaves no empty chat behind.
  let uiMessages: ChatMessage[];
  try {
    uiMessages = await validateUIMessages<ChatMessage>({
      messages: prepared.messages,
      // A message the client sends has no metadata; stored ones have their time, answers their model.
      metadataSchema: chatMessageMetadataSchema.optional(),
    });
  } catch (error) {
    console.error("chat: the history does not validate", id, error);
    return fail("bad-request", 400);
  }
  if (message && !chat) {
    await createChat({
      id,
      title: provisionalTitle(message),
      userId: session.user.id,
    });
  }
  if (prepared.dropFrom) {
    await deleteMessagesFrom(id, prepared.dropFrom);
  }
  await saveMessages(id, prepared.save);
  // Carrying on after approvals writes into the same answer.
  const originalMessages = message ? undefined : uiMessages;
  // «Stop» reaches the model through this (D6): what was written by then is saved as the answer.
  const generation = startGeneration(id);
  // Called once the answer is saved: a page reloaded before that finds the answer being written and joins it (D5).
  const recording: { saved?: () => void } = {};

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      // The server's time, for the page to count a running step by (a reloaded page gets its own, from the record).
      writer.write({ data: Date.now(), transient: true, type: "data-clock" });
      // A new chat gets its name from the titles model while the answer streams; the sidebar takes it at once.
      const name = async () => {
        const title =
          chat || !message
            ? null
            : await generateChatTitle({
                chatId: id,
                // The sidebar shows the chat being named from here to its title (or the end of the answer).
                onStart: () =>
                  writer.write({
                    data: true,
                    transient: true,
                    type: "data-naming",
                  }),
                text: textOf(message),
                userId: session.user.id,
              });
        if (title) {
          writer.write({ data: title, transient: true, type: "data-title" });
        }
      };
      const naming = name();
      // What the model is sent of the history (lib/context-budget): tool results cut at a cap, the oldest ones cleared
      // once the chat is long. The stored history stays whole — only this copy is trimmed.
      const budget = { window: model.contextWindow };
      const prompt = withPromptCache(
        model.kind,
        budgetMessages(await convertToModelMessages(uiMessages), budget)
      );
      const started = Date.now();
      let firstChunk: number | null = null;
      // How long the model reasoned: from its first reasoning to its first word (the folded reasoning says it).
      let reasoningFrom: number | null = null;
      let reasoningTo: number | null = null;
      // How long the work with tools took: to the last tool result (the folded work says it).
      let workTo: number | null = null;
      // Each tool call's own time, from its call to its result: the ribbon of the work says it per step.
      const stepStarts = new Map<string, number>();
      const stepMs: Record<string, number> = {};
      // Thoughts and notes are told apart by their place: an answer carried on after approvals counts on from those it has.
      const wordKeys = new Map<string, string>();
      const carried = originalMessages?.at(-1)?.parts ?? [];
      const counts = {
        reasoning: carried.filter((p) => p.type === "reasoning").length,
        text: carried.filter((p) => p.type === "text").length,
      };
      /** The step a stream part begins or ends: a tool call by its id, a thought or a note by its place. */
      const stepEvent = (part: {
        type: string;
        id?: string;
        toolCallId?: string;
      }): { begun?: string; ended?: string } => {
        if (part.type === "reasoning-start" || part.type === "text-start") {
          const kind = part.type === "text-start" ? "text" : "reasoning";
          const key = `${kind}:${counts[kind]}`;
          counts[kind] += 1;
          wordKeys.set(`${kind}:${part.id}`, key);
          return { begun: key };
        }
        if (part.type === "reasoning-end" || part.type === "text-end") {
          const kind = part.type === "text-end" ? "text" : "reasoning";
          return { ended: wordKeys.get(`${kind}:${part.id}`) };
        }
        if (part.type === "tool-input-start") {
          return { begun: part.id };
        }
        if (part.type === "tool-call") {
          return { begun: part.toolCallId };
        }
        if (part.type === "tool-result" || part.type === "tool-error") {
          return { ended: part.toolCallId };
        }
        return {};
      };
      const run = { chatId: id, model, userId: session.user.id };
      const record = async (
        r: Omit<Parameters<typeof recordRun>[0], keyof typeof run>
      ) => {
        try {
          await recordRun({ ...run, ...r });
        } catch (error) {
          console.error("chat: could not record the run", model.id, error);
        }
      };
      // The MCP servers the thread mentions (ARCH §8) — a big one's tools on demand, each told to the model with what
      // it is for — and our own table, chart and the web; a model that says it cannot call tools gets none. Ours come
      // last, so a server's tool of the same name cannot replace them.
      const servers =
        model.capabilities.tools === false
          ? []
          : await toolsForUser(
              session.user.id,
              serversOf(chatServers, uiMessages)
            );
      // The web as the admin left it (ARCH §8.1): search needs a SearXNG, reading pages does not.
      const web = await webToolsOn();
      const waiting = chatServers.filter((s) => s.signIn === "self");
      const tools: ToolSet =
        model.capabilities.tools === false
          ? {}
          : {
              ...lendTools(servers, calledIn(uiMessages)),
              [CHART_TOOL]: chartTool,
              [TABLE_TOOL]: tableTool,
              [TIME_TOOL]: timeTool(timeZone),
              ...(web.fetch ? { [WEB_FETCH]: webFetchTool } : {}),
              ...(web.search ? { [WEB_SEARCH]: webSearchTool } : {}),
              // The user's own mail, when they have a box (ARCH §17.7).
              ...(boxes.length > 0 ? emailTools(session.user.id, boxes) : {}),
              // «Connect X to go on», while there is a per-user service or mail the user has not connected.
              ...(waiting.length > 0 || boxes.length === 0
                ? {
                    [REQUEST_CONNECTION]: requestConnectionTool(waiting, {
                      mail: boxes.length === 0,
                    }),
                  }
                : {}),
            };
      const result = streamText({
        abortSignal: generation.signal,
        instructions: [TIME_NOTE, withNotes(notes, servicesNote(servers))]
          .filter(Boolean)
          .join("\n\n"),
        messages: prompt.messages,
        model: languageModel,
        // The model's own end frees the chat for «stop» — not the client's: it may leave, the model writes on.
        onAbort: ({ steps }) => {
          endGeneration(id, generation);
          // What the steps finished before «stop» used and cost — it was billed, so it is counted.
          return record({
            latencyMs: firstChunk,
            status: "aborted",
            stepsMetadata: steps.map((step) => step.providerMetadata),
            usage:
              steps.length > 0
                ? sumUsage(steps.map((s) => s.usage))
                : undefined,
          });
        },
        onChunk: ({ chunk }) => {
          // Time to the first thing the user sees, not to the stream's own bookkeeping.
          if (FIRST_TOKEN.has(chunk.type)) {
            firstChunk ??= Date.now() - started;
          }
          // The work is the servers' tools; a table or a chart is already the answer.
          if (
            (chunk.type === "tool-result" || chunk.type === "tool-error") &&
            chunk.toolName !== TABLE_TOOL &&
            chunk.toolName !== CHART_TOOL &&
            chunk.toolName !== TIME_TOOL
          ) {
            workTo = Date.now();
          }
          if (chunk.type === "reasoning-delta") {
            reasoningFrom ??= Date.now();
          } else if (chunk.type === "text-delta" && reasoningFrom !== null) {
            reasoningTo ??= Date.now();
          }
        },
        onEnd: ({ providerMetadata, steps, totalUsage }) => {
          endGeneration(id, generation);
          return record({
            latencyMs: firstChunk,
            providerMetadata,
            status: "ok",
            // The cost of every step — the answer's tokens are the total of them, so its cost must be too.
            stepsMetadata: steps.map((step) => step.providerMetadata),
            usage: totalUsage,
          });
        },
        // The provider's own error: the stream passes on only «An error occurred».
        onError: ({ error }) => {
          endGeneration(id, generation);
          console.error("chat: the model failed", model.id, causes(error));
          return record({ latencyMs: firstChunk, status: "error" });
        },
        // A tool's result goes back to the model until it answers in words — within reason; the last step answers.
        // Inside an answer the history grows with every tool result: the same budget, step by step (a returned
        // `messages` carries on to the later steps), then the last step, which answers.
        prepareStep: (options) => {
          const trimmed = budgetMessages(options.messages, budget);
          return {
            ...(trimmed === options.messages ? {} : { messages: trimmed }),
            ...lastStepAnswers(options),
          };
        },
        providerOptions: prompt.providerOptions,
        stopWhen: isStepCount(MAX_STEPS),
        tools,
      });
      // Runs the generation to its end on the server, so the answer is saved even when the client has left.
      void result.consumeStream();
      writer.merge(
        toUIMessageStream<ToolSet, ChatMessage>({
          // The answer names its model, so the thread can show who wrote it after the chat switches models, and at
          // the end how long it reasoned.
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return { createdAt: new Date().toISOString(), modelId: model.id };
            }
            // Each step's start and, when it ends, its time go to the page as they happen — so a step still going is
            // counted from the server's clock (also on a page reloaded in the middle of it), and a finished one shows
            // its time at once rather than at the end of the answer. A tool call is keyed by its id, a thought or a
            // note by its place among the answer's own.
            const { begun, ended } = stepEvent(part);
            if (begun !== undefined && !stepStarts.has(begun)) {
              const at = Date.now();
              stepStarts.set(begun, at);
              return { stepStartedAt: { [begun]: at } };
            }
            if (ended !== undefined) {
              const from = stepStarts.get(ended);
              if (from === undefined) {
                return;
              }
              const ms = Date.now() - from;
              stepMs[ended] = ms;
              return { stepMs: { [ended]: ms } };
            }
            if (part.type !== "finish") {
              return;
            }
            return {
              ...(reasoningFrom === null
                ? {}
                : { reasoningMs: (reasoningTo ?? Date.now()) - reasoningFrom }),
              ...(workTo === null ? {} : { workMs: workTo - started }),
              ...(Object.keys(stepMs).length === 0 ? {} : { stepMs }),
            };
          },
          // The model's own error reaches the page here, not through the wrapper's: a history too long for its window
          // is said as that; any other keeps what the SDK says by itself.
          onError: (error) =>
            isContextOverflow(error) ? "context-full" : "An error occurred.",
          originalMessages,
          sendReasoning: true,
          stream: result.stream,
        })
      );
      await naming;
    },
    generateId: () => crypto.randomUUID(),
    onEnd: async ({ messages: finished }) => {
      try {
        await saveMessages(id, finished);
      } finally {
        recording.saved?.();
      }
    },
    onError: (error) => {
      endGeneration(id, generation);
      console.error("chat: generation failed", model.id, error);
      // A history too long for the model's window is said as that, not as «the model did not answer».
      return (
        isContextOverflow(error) ? "context-full" : "generation-failed"
      ) satisfies ChatErrorCode;
    },
    originalMessages,
  });

  // The stream goes two ways: to the client, and to the record a reloaded page joins (GET /api/chat/[id]/stream).
  const [toClient, toRecord] = stream.tee();
  recording.saved = recordStream(
    id,
    toRecord as ReadableStream<UIMessageChunk>
  );
  // The server reads its own copy to the end: an answer is saved whole when the client leaves halfway, and only
  // «stop» (above) cuts it short.
  return createUIMessageStreamResponse({
    consumeSseStream: consumeStream,
    stream: toClient,
  });
};
