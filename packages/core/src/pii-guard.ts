// Data protection (docs/PII-GUARD-PLAN.md, D46 variant B): before a call to an external model the
// prompt goes through PII Guard (our fork, `/s/<session>/v1/chat/mask`), the model sees labels
// instead of names, phones, addresses and documents, and its answer and tool-call arguments are
// restored (`/chat/restore`) before AI SDK runs a tool or anyone reads the text.
//
// The prompt is sent as a chat-completions body (texts, reasoning, tool calls and results) and the
// masked strings are written back into the same parts; files and images stay as they are (owner's
// decision). The guard prepends a system note when labels are present. A guard that does not answer
// stops the call: nothing goes to the model unmasked (owner's decision).

import type { LanguageModelMiddleware } from "ai";

type Params = Parameters<
  NonNullable<LanguageModelMiddleware["transformParams"]>
>[0]["params"];
type Prompt = Params["prompt"];
type PromptMessage = Prompt[number];
type GenerateResult = Awaited<
  ReturnType<NonNullable<LanguageModelMiddleware["wrapGenerate"]>>
>;
type StreamResult = Awaited<
  ReturnType<NonNullable<LanguageModelMiddleware["wrapStream"]>>
>;
type StreamPart =
  StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/** What the guard found in one masked prompt: the label the model saw, its type and the value. */
export interface GuardEntity {
  placeholder: string;
  type: string;
  value: string;
}

/** One masked call, for "what the model saw" (З4). */
export interface MaskedCall {
  /** The chat messages as the model got them, the guard's note included. */
  messages: ChatMessage[];
  /** The same request as AI SDK's prompt (tool calls keep their ids), without the note. */
  prompt?: Prompt;
  entities: GuardEntity[];
  ms: number;
}

/** What the model wrote in one call, before the values were restored (З4: "what the model said"). */
export interface ModelAnswer {
  text: string;
  toolCalls: { toolCallId: string; toolName: string; input: string }[];
}

export interface GuardOptions {
  url: string;
  token?: string;
  /** Guard session: one per conversation, so a person keeps one label (`3-128 of A-Za-z0-9_-`). */
  session: string;
  fetch?: typeof globalThis.fetch;
  /** Called with every masked prompt (the step's request as the model saw it). */
  onMasked?: (call: MaskedCall) => void;
  /** Called with every answer as the model wrote it, before restoring. */
  onAnswer?: (answer: ModelAnswer) => void;
}

/** The guard did not answer: the call is not made (fail closed). */
export class GuardUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Защита данных недоступна: запрос не отправлен", { cause });
    this.name = "GuardUnavailableError";
  }
}

/** Whether ``error`` (or what it wraps: AI SDK puts a thrown error into its own) is the guard down. */
export const isGuardUnavailable = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof GuardUnavailableError) {
      return true;
    }
    if ((current as { name?: unknown }).name === "GuardUnavailableError") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

const SESSION_RE = /[^A-Za-z0-9_-]/gu;

/** A session id the guard accepts, from any id (a chat id, a task id). */
export const guardSession = (id: string): string => {
  const clean = id.replace(SESSION_RE, "-").slice(0, 128);
  return clean.length >= 3 ? clean : `${clean}---`.slice(0, 3);
};

// --- Prompt <-> chat-completions body ---------------------------------------------------

type ChatContent = string | { type: "text"; text: string }[] | null;
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: ChatContent;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}
type Writer = (masked: ChatMessage[], prompt: PromptMessage[]) => void;

/** Element ``i`` of what the guard returned; a shorter answer is a broken contract, not a pass. */
const pick = <T>(items: readonly T[], i: number): T => {
  const item = items[i];
  if (item === undefined) {
    throw new GuardUnavailableError(
      new Error("pii-guard returned fewer messages")
    );
  }
  return item;
};
const asMessage = (value: unknown) => value as PromptMessage;

export const toolOutputText = (output: unknown): string | null => {
  const o = output as { type: string; value: unknown };
  switch (o.type) {
    case "text":
    case "error-text": {
      return String(o.value);
    }
    case "json":
    case "error-json": {
      return JSON.stringify(o.value);
    }
    case "content": {
      return (o.value as { type: string; text?: string }[])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
    }
    default: {
      // execution-denied and the like carry no data
      return null;
    }
  }
};

const withToolOutput = (output: unknown, masked: string): unknown => {
  const o = output as { type: string; value: unknown };
  switch (o.type) {
    case "text":
    case "error-text": {
      return { ...o, value: masked };
    }
    case "json":
    case "error-json": {
      return { ...o, value: JSON.parse(masked) };
    }
    case "content": {
      // Text pieces were joined for masking; the masked text takes the first text slot, other
      // slots (images) stay.
      let first = true;
      const value = (o.value as { type: string }[]).flatMap((c) => {
        if (c.type !== "text") {
          return [c];
        }
        if (!first) {
          return [];
        }
        first = false;
        return [{ ...c, text: masked }];
      });
      return { ...o, value };
    }
    default: {
      return o;
    }
  }
};

/**
 * The prompt as a chat-completions body, and writers that put the masked strings back into a
 * copy of the prompt. Texts and reasoning of a message are one content array; tool calls and
 * their results are paired by ids the guard never sees as personal data (`call_<n>`).
 */
export const toChat = (
  prompt: Prompt
): { messages: ChatMessage[]; writers: Writer[] } => {
  const messages: ChatMessage[] = [];
  const writers: Writer[] = [];
  const ids = new Map<string, string>();
  const idOf = (id: string) => {
    if (!ids.has(id)) {
      ids.set(id, `call_${ids.size}`);
    }
    return ids.get(id) as string;
  };
  for (const [i, message] of prompt.entries()) {
    const at = messages.length;
    if (message.role === "system") {
      messages.push({ content: message.content, role: "system" });
      writers.push((masked, out) => {
        out[i] = asMessage({
          ...pick(out, i),
          content: String(pick(masked, at).content ?? ""),
        });
      });
      continue;
    }
    if (message.role === "user" || message.role === "assistant") {
      const parts = message.content as { type: string; text?: string }[];
      const texts = parts
        .map((p, k) => [p, k] as const)
        .filter(([p]) => p.type === "text" || p.type === "reasoning");
      const calls = parts
        .map((p, k) => [p, k] as const)
        .filter(([p]) => p.type === "tool-call") as unknown as (readonly [
        { toolCallId: string; toolName: string; input: unknown },
        number,
      ])[];
      const chat: ChatMessage = {
        content: texts.length
          ? texts.map(([p]) => ({ text: p.text ?? "", type: "text" as const }))
          : null,
        role: message.role,
      };
      if (message.role === "user" && chat.content === null) {
        chat.content = "";
      }
      if (calls.length) {
        chat.tool_calls = calls.map(([p]) => ({
          function: {
            arguments: JSON.stringify(p.input ?? {}),
            name: p.toolName,
          },
          id: idOf(p.toolCallId),
          type: "function" as const,
        }));
      }
      messages.push(chat);
      writers.push((masked, out) => {
        const m = pick(masked, at);
        const content = [...(pick(out, i).content as unknown[])] as Record<
          string,
          unknown
        >[];
        const maskedTexts = Array.isArray(m.content) ? m.content : [];
        for (const [n, [, k]] of texts.entries()) {
          content[k] = { ...content[k], text: maskedTexts[n]?.text ?? "" };
        }
        for (const [n, [, k]] of calls.entries()) {
          const args = m.tool_calls?.[n]?.function.arguments ?? "{}";
          content[k] = { ...content[k], input: JSON.parse(args) };
        }
        out[i] = asMessage({ ...pick(out, i), content });
      });
      continue;
    }
    // role: tool — one chat message per result
    const results = (message.content as { type: string }[])
      .map((p, k) => [p, k] as const)
      .filter(([p]) => p.type === "tool-result") as unknown as (readonly [
      { toolCallId: string; output: unknown },
      number,
    ])[];
    const slots: [number, number][] = [];
    for (const [p, k] of results) {
      const text = toolOutputText(p.output);
      if (text === null) {
        continue;
      }
      slots.push([messages.length, k]);
      messages.push({
        content: text,
        role: "tool",
        tool_call_id: idOf(p.toolCallId),
      });
    }
    if (!slots.length) {
      continue;
    }
    writers.push((masked, out) => {
      const content = [...(pick(out, i).content as unknown[])] as Record<
        string,
        unknown
      >[];
      for (const [slot, k] of slots) {
        const part = pick(content, k);
        content[k] = {
          ...part,
          output: withToolOutput(
            part.output,
            String(pick(masked, slot).content ?? "")
          ),
        };
      }
      out[i] = asMessage({ ...pick(out, i), content });
    });
  }
  return { messages, writers };
};

// --- Guard calls ------------------------------------------------------------------------

interface RestoreItem {
  kind: "text" | "arguments" | "stream";
  text: string;
  final?: boolean;
}

const client = (options: GuardOptions) => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = options.url.replace(/\/+$/u, "");
  const session = guardSession(options.session);
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await doFetch(`${base}/s/${session}/v1/chat/${path}`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          "x-pii-guard-language": "ru",
          ...(options.token ? { "x-pii-guard-token": options.token } : {}),
        },
        method: "POST",
      });
    } catch (error) {
      throw new GuardUnavailableError(error);
    }
    if (!response.ok) {
      // The guard refused (fail closed on its side too): never forward the original.
      throw new GuardUnavailableError(
        new Error(`pii-guard ${path}: ${response.status}`)
      );
    }
    return (await response.json()) as T;
  };
  return {
    mask: (messages: ChatMessage[]) =>
      post<{
        body: { messages: ChatMessage[] };
        entities: GuardEntity[];
        ms: number;
      }>("mask", {
        messages,
      }),
    restore: async (items: RestoreItem[]) => {
      const answer = await post<{ items: { text: string; held?: string }[] }>(
        "restore",
        { items }
      );
      return answer.items;
    },
  };
};

// Text that cannot hold a label or the start of one (or a preposition a label may follow) is
// passed on without a round trip to the guard.
const MAY_HOLD = /\[\[|[Пп]ерсон/u;
const MAY_START =
  /(?:\[\[?[A-Z_0-9a-f]*\]?|[Пп](?:е(?:р(?:с(?:о(?:н[а-яё_\s0-9a-f-]*)?)?)?)?)?|(?:^|[\s(«"'])(?:с|со|к|ко|в|во|о|об|обо)\s*)$/iu;

const strings = (value: unknown, out: string[]): void => {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      strings(item, out);
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      strings(item, out);
    }
  }
};

const replaceStrings = (value: unknown, next: () => string): unknown => {
  if (typeof value === "string") {
    return next();
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceStrings(item, next));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceStrings(item, next),
      ])
    );
  }
  return value;
};

/**
 * Every string in ``value`` masked in one guard call (a decision model's state: its answers are
 * yes/no or a choice, so nothing comes back to restore). In the chat's session the labels are the
 * chat's.
 */
export const maskStrings = async <T>(
  value: T,
  options: GuardOptions
): Promise<T> => {
  const found: string[] = [];
  strings(value, found);
  if (!found.length) {
    return value;
  }
  const result = await client(options).mask(
    found.map((content) => ({ content, role: "user" as const }))
  );
  const { messages } = result.body;
  const masked = messages.slice(messages.length - found.length);
  options.onMasked?.({ entities: result.entities, messages, ms: result.ms });
  let at = 0;
  return replaceStrings(value, () => {
    const message = pick(masked, at);
    at += 1;
    return String(message.content ?? "");
  }) as T;
};

/** Masks every prompt, restores text, reasoning and tool-call arguments in the answer. */
export const maskingMiddleware = (
  options: GuardOptions
): LanguageModelMiddleware => {
  const guard = client(options);

  const restoreTexts = async (
    texts: string[],
    kind: "text" | "arguments"
  ): Promise<string[]> => {
    if (!texts.length) {
      return [];
    }
    const restored = await guard.restore(texts.map((text) => ({ kind, text })));
    return restored.map((r) => r.text);
  };

  return {
    transformParams: async ({ params }) => {
      const { messages, writers } = toChat(params.prompt);
      const result = await guard.mask(messages);
      const masked = result.body.messages;
      // The guard puts its note (system messages) in front of the conversation.
      const notes = masked.length - messages.length;
      if (notes < 0) {
        throw new GuardUnavailableError(
          new Error("pii-guard dropped messages")
        );
      }
      const rest = masked.slice(notes);
      const prompt = [...params.prompt] as PromptMessage[];
      for (const write of writers) {
        write(rest, prompt);
      }
      options.onMasked?.({
        entities: result.entities,
        messages: masked,
        ms: result.ms,
        prompt: prompt as Prompt,
      });
      const head = masked.slice(0, notes).map((m) => ({
        content: String(m.content ?? ""),
        role: "system" as const,
      }));
      return { ...params, prompt: [...head, ...prompt] as Prompt };
    },

    wrapGenerate: async ({ doGenerate, params }) => {
      const result = (await doGenerate()) as GenerateResult;
      const content = result.content as Record<string, unknown>[];
      options.onAnswer?.({
        text: content
          .filter((c) => c.type === "text")
          .map((c) => String(c.text))
          .join(""),
        toolCalls: content
          .filter((c) => c.type === "tool-call")
          .map((c) => ({
            input: String(c.input),
            toolCallId: String(c.toolCallId),
            toolName: String(c.toolName),
          })),
      });
      const textual = content
        .map((c, i) => [c, i] as const)
        .filter(
          ([c]) =>
            (c.type === "text" || c.type === "reasoning") &&
            MAY_HOLD.test(String(c.text))
        );
      const calls = content
        .map((c, i) => [c, i] as const)
        .filter(
          ([c]) => c.type === "tool-call" && MAY_HOLD.test(String(c.input))
        );
      const [texts, inputs] = await Promise.all([
        restoreTexts(
          textual.map(([c]) => String(c.text)),
          // A structured answer is JSON: values go back escaped, so a quote cannot break it.
          params.responseFormat?.type === "json" ? "arguments" : "text"
        ),
        restoreTexts(
          calls.map(([c]) => String(c.input)),
          "arguments"
        ),
      ]);
      const out = [...content];
      for (const [n, [c, i]] of textual.entries()) {
        out[i] = { ...c, text: texts[n] };
      }
      for (const [n, [c, i]] of calls.entries()) {
        out[i] = { ...c, input: inputs[n] };
      }
      return { ...result, content: out } as GenerateResult;
    },

    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = (await doStream()) as StreamResult;
      // Held tails per text or reasoning part (a label may be split across deltas).
      const held = new Map<string, string>();
      const flush = async (id: string): Promise<string> => {
        const tail = held.get(id) ?? "";
        held.delete(id);
        if (!tail) {
          return "";
        }
        if (!MAY_HOLD.test(tail)) {
          return tail;
        }
        const r = pick(
          await guard.restore([{ final: true, kind: "stream", text: tail }]),
          0
        );
        return r.text;
      };
      const feed = async (id: string, delta: string): Promise<string> => {
        const text = (held.get(id) ?? "") + delta;
        if (!MAY_HOLD.test(text) && !MAY_START.test(text)) {
          held.delete(id);
          return text;
        }
        const r = pick(await guard.restore([{ kind: "stream", text }]), 0);
        held.set(id, r.held ?? "");
        return r.text;
      };
      // The answer as the model wrote it, for "what the model saw" (reported once, at the end).
      const answer: ModelAnswer = { text: "", toolCalls: [] };
      const transform = new TransformStream<StreamPart, StreamPart>({
        flush() {
          options.onAnswer?.(answer);
        },
        async transform(part, controller) {
          const p = part as Record<string, unknown> & {
            type: string;
            id?: string;
          };
          if (p.type === "text-delta") {
            answer.text += String(p.delta);
          }
          if (p.type === "tool-call") {
            answer.toolCalls.push({
              input: String(p.input),
              toolCallId: String(p.toolCallId),
              toolName: String(p.toolName),
            });
          }
          if (p.type === "text-delta" || p.type === "reasoning-delta") {
            const text = await feed(`${p.type}:${p.id}`, String(p.delta));
            if (text) {
              controller.enqueue({ ...p, delta: text } as StreamPart);
            }
            return;
          }
          if (p.type === "text-end" || p.type === "reasoning-end") {
            const kind =
              p.type === "text-end" ? "text-delta" : "reasoning-delta";
            const text = await flush(`${kind}:${p.id}`);
            if (text) {
              controller.enqueue({
                delta: text,
                id: p.id,
                type: kind,
              } as StreamPart);
            }
            controller.enqueue(part);
            return;
          }
          // Tool input arrives whole in `tool-call`, restored there: the deltas would show labels.
          if (p.type === "tool-input-delta") {
            return;
          }
          if (p.type === "tool-call" && MAY_HOLD.test(String(p.input))) {
            const [input] = await restoreTexts([String(p.input)], "arguments");
            controller.enqueue({ ...p, input } as StreamPart);
            return;
          }
          controller.enqueue(part);
        },
      });
      return { ...rest, stream: stream.pipeThrough(transform) } as StreamResult;
    },
  };
};
