// S13 part 2: the service model writes memory items (fact / event / commitment / rule) with dates from one
// Russian message (D39). Language models through Vercel AI Gateway and Yandex AI Studio, keys from the dev DB.

import { mkdirSync, writeFileSync } from "node:fs";

import { createGateway } from "@ai-sdk/gateway";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type LanguageModel } from "ai";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { z } from "zod";

import { yandexFetch } from "../../packages/core/src/ai-yandex-fetch.ts";
import {
  TIMEZONE,
  TODAY_ISO,
  TODAY_TEXT,
  extractCases,
  knownCards,
  type Expect,
  type When,
} from "./extract-cases.ts";
import { catalogPrice, sourceKey } from "./keys.ts";

const PROMPT = process.env.PROMPT ?? "v2";
const MODELS = (
  process.env.MODELS ??
  "anthropic/claude-haiku-5.5,openai/gpt-6-luna,google/gemini-3.5-flash-lite,deepseek/deepseek-v4.1-flash,alibaba/qwen3.8-flash,mistral/mistral-small,anthropic/claude-sonnet-5"
).split(",");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);

// --- models ------------------------------------------------------------------------------------------------------

const gw = createGateway({ apiKey: sourceKey("gateway").key });
const gwPrices = new Map<string, { input: number; output: number }>();
{
  const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
  for (const m of (await res.json()).data) {
    if (m.pricing?.input) {
      gwPrices.set(m.id, { input: Number(m.pricing.input) * 1e6, output: Number(m.pricing.output) * 1e6 });
    }
  }
}

let yandex: ((id: string) => LanguageModel) | undefined;
const model = (id: string): { model: LanguageModel; price?: { input: number; output: number; currency: string } } => {
  if (id.startsWith("yandex:")) {
    const short = id.slice("yandex:".length);
    if (!yandex) {
      const { key, options } = sourceKey("yandex");
      const p = createOpenAICompatible({
        apiKey: key,
        baseURL: "https://ai.api.cloud.yandex.net/v1",
        // Yandex is reachable from here only through the corporate proxy (the app's source is on «auto»).
        fetch: yandexFetch(
          (process.env.HTTPS_PROXY
            ? (url: any, init: any) => undiciFetch(url, { ...init, dispatcher: new ProxyAgent(process.env.HTTPS_PROXY!) })
            : fetch) as typeof fetch
        ),
        includeUsage: true,
        name: "yandex",
        supportsStructuredOutputs: true,
      });
      yandex = (m) => p.chatModel(`gpt://${options.folderId}/${m}/latest`);
    }
    return { model: yandex(short), price: catalogPrice("yandex", short) };
  }
  const price = gwPrices.get(id);
  return { model: gw(id), price: price && { ...price, currency: "USD" } };
};

// --- schema and prompt -------------------------------------------------------------------------------------------

const when = z
  .object({
    date: z.string().describe("YYYY-MM-DD. For a week — the middle of it; for a month — its first day"),
    precision: z.enum(["day", "week", "month", "year"]),
  })
  .nullable();

const schema = z.object({
  new_entities: z
    .array(
      z.object({
        id: z.string().describe("new:<latin-slug>"),
        kind: z.enum(["person", "organization", "project"]),
        name: z.string(),
        about: z.string().describe("What we learned about it, one line"),
      })
    )
    .describe("People, organizations and projects mentioned that are not among the known cards"),
  items: z.array(
    z.object({
      kind: z.enum(["fact", "event", "commitment", "rule"]),
      text: z.string().describe("One short self-contained sentence in the message's language, with full names"),
      about: z.array(z.string()).describe("Refs: the subject of a fact or rule, the participants of an event, debtor and creditor of a commitment"),
      debtor: z.string().nullable().describe("Commitment only: who has to do it"),
      creditor: z.string().nullable().describe("Commitment only: for whom"),
      when: when.describe("Fact: since when it is true. Event: when it happened or is scheduled. Commitment: when it was given. Null if unknown"),
      due: when.describe("Commitment only: the deadline, null if none"),
      interval_days: z.number().nullable().describe("Rule only: the period or threshold in days"),
    })
  ),
});

const system = `You maintain the long-term memory of one user of a work assistant. From the user's latest message, extract what is worth remembering about their work: facts, events, commitments and the user's standing rules for the assistant.

Today is ${TODAY_TEXT} (${TODAY_ISO}), time zone ${TIMEZONE}.

Known cards (ref: description):
${Object.entries(knownCards).map(([k, v]) => `- ${k}: ${v}`).join("\n")}
- user: the user themselves

Rules:
- Kinds: fact — a lasting state or attribute (role, stage, preference, birthday); event — something that happened or is scheduled at a time; commitment — someone owes someone an action, with or without a deadline; rule — the user's standing instruction about reminders or what to highlight.
- Refs: use a known card id, "user", or an id from new_entities. Pick a card only when the message makes it clear; a person not in the cards goes to new_entities.
- Dates: resolve relative dates against today and against the moment they refer to («в прошлый вторник сказал, что через две недели» — two weeks from that Tuesday). Past tense with a weekday means the latest such day before today. Set precision honestly: «на днях» is a week, «в начале октября» is a month. Never invent a date that the message does not imply.
- Waiting for someone's reply, decision or result («ждём ответа», «обещала прислать») is that party's commitment to the user, besides any event.
- For a commitment, \`when\` is the day it was given or said, \`due\` is the deadline; never put the deadline into \`when\`.
- Every person or organization mentioned gets a ref: a known card, "user", or a new_entities id — also when unnamed («поставщик упаковки»).
- Requests to the assistant itself (count, write, plan), questions and small talk produce no items — return empty arrays.
- Do not add judgements or guesses that the message does not state.`;

// PROMPT=app — the prompt and schema the app itself sends (packages/core/src/memory-extract.ts), on the same cases.
const app = PROMPT === "app" ? await import("../../packages/core/src/memory-extract.ts") : null;
const appCards = Object.entries(knownCards).map(([ref, line]) => {
  const [name, rest = ""] = line.split(" — ");
  const [kindWord, role = null] = rest.split(": ");
  const kind = kindWord === "человек" ? "person" : kindWord === "организация" ? "org" : "project";
  return { aliases: [], id: ref, kind, name, ref, role } as const;
});
const useSchema = app ? app.extractionSchema : schema;
const useSystem = app
  ? app.memoryInstructions({ cards: appCards, sentAt: new Date(`${TODAY_ISO}T09:00:00Z`), timeZone: TIMEZONE })
  : system;

// --- scoring -----------------------------------------------------------------------------------------------------

type Item = z.infer<typeof schema>["items"][number];

const dateOk = (want: When, got: Item["when"]) => {
  if (!got) return false;
  if (want.precision === "day") return got.precision === "day" && got.date === want.date;
  if (want.precision === "month") return got.precision === "month" && got.date.slice(0, 7) === want.month;
  return got.precision === "week" && got.date >= want.from && got.date <= want.to;
};

// «new» — any id from new_entities: the app takes «new_petrov» as well as «new:petrov».
let freshIds = new Set<string>();
const refOk = (want: string, got: string | null | undefined) =>
  want === "new" ? !!got && (got.startsWith("new:") || freshIds.has(got)) : got === want;

const matches = (e: Expect, it: Item) => {
  const kinds = Array.isArray(e.kind) ? e.kind : [e.kind];
  if (!kinds.includes(it.kind)) return false;
  if (e.debtor && ![e.debtor].flat().some((d) => refOk(d, it.debtor))) return false;
  if (e.creditor && !refOk(e.creditor, it.creditor)) return false;
  if (e.about && !e.about.every((w) => it.about.some((g) => refOk(w, g)))) return false;
  return true;
};

interface Scored {
  text: string;
  expected: number;
  found: number;
  dates: number;
  datesOk: number;
  extra: number;
  items?: z.infer<typeof schema>;
  misses: string[];
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

const score = (c: (typeof extractCases)[number], out: z.infer<typeof schema>) => {
  freshIds = new Set(out.new_entities.map((e) => e.id));
  const used = new Set<number>();
  const misses: string[] = [];
  let found = 0;
  let dates = 0;
  let datesOk = 0;
  for (const e of c.expect) {
    const i = out.items.findIndex((it, i) => !used.has(i) && matches(e, it));
    const checks = [e.when && ["when", e.when], e.due && ["due", e.due]].filter(Boolean) as [
      "when" | "due",
      When,
    ][];
    dates += checks.length;
    if (i < 0) {
      misses.push(`missing ${JSON.stringify(e)}`);
      continue;
    }
    used.add(i);
    found++;
    for (const [field, want] of checks) {
      if (dateOk(want, out.items[i][field])) datesOk++;
      else misses.push(`${field}: want ${JSON.stringify(want)}, got ${JSON.stringify(out.items[i][field])}`);
    }
    if (e.intervalDays) {
      dates++;
      if (e.intervalDays.includes(out.items[i].interval_days ?? -1)) datesOk++;
      else misses.push(`interval: want ${e.intervalDays}, got ${out.items[i].interval_days}`);
    }
  }
  const extra = out.items.length - used.size;
  if (c.expect.length === 0 && extra) misses.push(`${extra} items where none were due`);
  return { dates, datesOk, extra, found, misses };
};

// --- run ---------------------------------------------------------------------------------------------------------

const pool = async <T, R>(items: T[], n: number, fn: (item: T) => Promise<R>) => {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
};

const runCase = async (id: string, c: (typeof extractCases)[number]): Promise<Scored> => {
  const started = performance.now();
  try {
    const { model: m } = model(id);
    const result = await generateText({
      maxRetries: 1,
      ...(process.env.REASONING ? { reasoning: process.env.REASONING as "none" } : {}),
      model: m,
      output: Output.object({ schema: useSchema }),
      prompt: app ? `<message>\n${c.text}\n</message>` : c.text,
      providerOptions: id.startsWith("yandex:") ? {} : { gateway: { zeroDataRetention: true } },
      system: useSystem,
    });
    const out = result.output;
    return {
      expected: c.expect.length,
      inputTokens: result.usage.inputTokens,
      items: out,
      ms: performance.now() - started,
      outputTokens: result.usage.outputTokens,
      text: c.text,
      ...score(c, out),
    };
  } catch (error) {
    return {
      dates: 0, datesOk: 0, expected: c.expect.length, extra: 0, found: 0, misses: [],
      error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : String(error),
      ms: performance.now() - started,
      text: c.text,
    };
  }
};

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");

mkdirSync(new URL("./results/extract/", import.meta.url), { recursive: true });
const rows = await Promise.all(
  MODELS.map(async (id) => {
    const results = await pool(extractCases, CONCURRENCY, (c) => runCase(id, c));
    const ok = results.filter((r) => !r.error);
    const sum = (f: (r: Scored) => number) => ok.reduce((s, r) => s + f(r), 0);
    const price = model(id).price;
    const cost = price
      ? (sum((r) => r.inputTokens ?? 0) * price.input + sum((r) => r.outputTokens ?? 0) * price.output) / 1e6
      : undefined;
    const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
    const row = {
      model: id,
      calls: `${ok.length}/${results.length}`,
      items_found: pct(sum((r) => r.found), sum((r) => r.expected)),
      dates_ok: pct(sum((r) => r.datesOk), sum((r) => r.dates)),
      empty_ok: `${ok.filter((r) => r.expected === 0 && r.extra === 0).length}/${ok.filter((r) => r.expected === 0).length}`,
      extra_items: sum((r) => (r.expected ? r.extra : 0)),
      p50_ms: Math.round(ms[Math.floor(ms.length / 2)] ?? 0),
      p95_ms: Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] ?? 0),
      cost_per_msg: cost === undefined ? "—" : `${(cost / ok.length).toFixed(6)} ${price!.currency}`,
      first_error: results.find((r) => r.error)?.error,
    };
    console.log(JSON.stringify(row));
    writeFileSync(
      new URL(`./results/extract/${PROMPT}.${id.replace(/[/:]/g, "__")}.json`, import.meta.url),
      JSON.stringify({ row, results }, null, 2)
    );
    return row;
  })
);
writeFileSync(new URL(`./results/extract/${PROMPT}.summary.json`, import.meta.url), JSON.stringify(rows, null, 2));
