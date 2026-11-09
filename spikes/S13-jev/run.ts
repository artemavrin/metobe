// S13: decision models (Jev and the like) through Vercel AI Gateway on Russian memory decisions (D39).
// The Gateway key is the dev source's own: read from the dev DB and decrypted with SECRETS_KEY, never printed.

import { mkdirSync, writeFileSync } from "node:fs";

import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate } from "ai";

import { sourceKey } from "./keys.ts";
import {
  TODAY,
  cards,
  closing,
  commitments,
  entity,
  gate,
  relations,
  temporal,
} from "./cases.ts";

type Lang = "en" | "ru";

const MODELS = (process.env.MODELS ?? "typesafe-ai/jev-1.14.0").split(",");
const LANGS = (process.env.LANGS ?? "en,ru").split(",") as Lang[];
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 2);

const gateway = createGateway({ apiKey: sourceKey("gateway").key });

// --- questions in two languages ----------------------------------------------------------------------------------

const t = {
  en: {
    remember:
      "Does the user's message contain information about their work or life worth saving to long-term memory (people, organizations, projects, events, promises, preferences, standing instructions)? Requests to the assistant, questions and small talk are not.",
    fact: "Does the message state a lasting fact about a person, organization, project or the user (role, stage, attribute, preference)? One-time happenings are not facts.",
    event:
      "Does the message report something that happened or is scheduled at a specific time (a meeting, a call, something sent or received, a signing)?",
    commitment:
      "Does the message report a promise or obligation between people: someone has to do something for someone, with or without a deadline? A request to the assistant itself (write, count, make a plan) and a standing instruction to the assistant are not commitments.",
    rule: "Does the user give a standing instruction about how or how often the assistant should remind them or highlight something?",
    direction: "If there is a promise or obligation, who owes whom?",
    directionCriteria: {
      user_owes: "The user owes something to someone",
      owed_to_user: "Someone owes something to the user or the user's team",
      between_others: "Between other people; the user is not a party",
      none: "No promise or obligation",
    },
    precision: "How precisely is the date of what the message describes known?",
    precisionCriteria: {
      day: "A specific day: a date, a weekday, yesterday, tomorrow",
      week: "Approximately, within a week: recently, the other day, this week",
      month: "Only a month or part of a month",
      none: "No date at all",
    },
    entity:
      "Which known card is the message about? If the person or organization is not among the cards, choose `new`; if more than one card fits equally well, choose `unclear`.",
    entityExtra: {
      new: "Not among the known cards",
      unclear: "More than one card fits; the message does not tell which",
    },
    closes: (c: string) =>
      `Open commitment: «${c}». Does the message say this commitment is now fully fulfilled? Partial progress, a delay or a new deadline does not count.`,
    relation: "How does the new statement relate to the current fact?",
    relationCriteria: {
      replaces: "A new state: the current fact stops being true from now on",
      history: "A past state: it was true earlier; the current fact stays",
      correction: "A correction: the current fact was recorded wrongly",
      addition: "Another fact about the same subject; the current one is untouched",
    },
  },
  ru: {
    remember:
      "Есть ли в сообщении пользователя сведения о его работе или жизни, которые стоит сохранить в долговременную память (люди, организации, проекты, события, обещания, предпочтения, постоянные указания)? Просьбы к ассистенту, вопросы и вежливые реплики — нет.",
    fact: "Сообщает ли сообщение устойчивый факт о человеке, организации, проекте или о самом пользователе (роль, этап, свойство, предпочтение)? Разовые происшествия — не факты.",
    event:
      "Сообщает ли сообщение о том, что произошло или назначено на определённое время (встреча, звонок, что-то отправили или получили, подписали)?",
    commitment:
      "Сообщает ли сообщение об обещании или обязательстве между людьми: кто-то должен что-то сделать для кого-то, со сроком или без? Просьба к самому ассистенту (напиши, посчитай, составь план) и постоянное указание ассистенту — не обязательства.",
    rule: "Даёт ли пользователь постоянное указание, как или как часто ассистенту напоминать или что подсвечивать?",
    direction: "Если есть обещание или обязательство — кто кому должен?",
    directionCriteria: {
      user_owes: "Пользователь должен кому-то",
      owed_to_user: "Кто-то должен пользователю или его команде",
      between_others: "Между другими людьми, пользователь не участвует",
      none: "Обещания или обязательства нет",
    },
    precision: "Насколько точно известна дата того, о чём сообщение?",
    precisionCriteria: {
      day: "Конкретный день: дата, день недели, вчера, завтра",
      week: "Примерно, в пределах недели: недавно, на днях, на этой неделе",
      month: "Известен только месяц или его часть",
      none: "Даты нет совсем",
    },
    entity:
      "О какой из известных карточек сообщение? Если человека или организации среди карточек нет — `new`; если одинаково подходят несколько — `unclear`.",
    entityExtra: {
      new: "Нет среди известных карточек",
      unclear: "Подходит больше одной карточки, из сообщения не понять, какая",
    },
    closes: (c: string) =>
      `Открытое обязательство: «${c}». Говорит ли сообщение, что оно теперь выполнено полностью? Частичный результат, задержка или новый срок не считаются.`,
    relation: "Как новое утверждение относится к текущему факту?",
    relationCriteria: relations,
  },
} satisfies Record<Lang, unknown>;

// --- tasks -------------------------------------------------------------------------------------------------------

interface Decision {
  task: "gate" | "entity" | "closing" | "temporal";
  case: string;
  question: string;
  kind: "boolean" | "choice";
  expected: boolean | string;
  /** P(true) for booleans, P(chosen) for choices when the model gives a distribution. */
  p?: number;
  got?: boolean | string;
  correct?: boolean;
}

interface Call {
  task: Decision["task"];
  case: string;
  state: unknown;
  questions: Record<string, any>;
  expected: Record<string, boolean | string>;
}

const buildCalls = (lang: Lang): Call[] => {
  const q = t[lang];
  const calls: Call[] = [];
  for (const c of gate) {
    const expected: Record<string, boolean | string> = { remember: c.remember };
    for (const k of ["fact", "event", "commitment", "rule", "direction", "precision"] as const) {
      if (c[k] !== undefined) expected[k] = c[k]!;
    }
    calls.push({
      task: "gate",
      case: c.text,
      state: { today: TODAY, message: c.text },
      questions: {
        remember: { type: "boolean", instructions: q.remember },
        fact: { type: "boolean", instructions: q.fact },
        event: { type: "boolean", instructions: q.event },
        commitment: { type: "boolean", instructions: q.commitment },
        rule: { type: "boolean", instructions: q.rule },
        direction: { type: "choice", instructions: q.direction, criteria: q.directionCriteria },
        precision: { type: "choice", instructions: q.precision, criteria: q.precisionCriteria },
      },
      expected,
    });
  }
  const known = Object.fromEntries(
    Object.entries(cards).filter(([k]) => k !== "new" && k !== "unclear")
  );
  for (const c of entity) {
    calls.push({
      task: "entity",
      case: c.text,
      state: { known_cards: known, message: c.text },
      questions: {
        card: { type: "choice", instructions: q.entity, criteria: { ...known, ...q.entityExtra } },
      },
      expected: { card: c.expected },
    });
  }
  for (const c of closing) {
    calls.push({
      task: "closing",
      case: c.text,
      state: { today: TODAY, open_commitments: commitments, message: c.text },
      questions: Object.fromEntries(
        Object.entries(commitments).map(([id, text]) => [
          id,
          { type: "boolean", instructions: q.closes(text) },
        ])
      ),
      expected: Object.fromEntries(Object.keys(commitments).map((id) => [id, c.closes.includes(id)])),
    });
  }
  for (const c of temporal) {
    calls.push({
      task: "temporal",
      case: c.text,
      state: { today: TODAY, current_fact: c.current, new_statement: c.text },
      questions: {
        relation: { type: "choice", instructions: q.relation, criteria: q.relationCriteria },
      },
      expected: { relation: c.expected },
    });
  }
  return calls;
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

interface CallResult {
  decisions: Decision[];
  ms: number;
  inputTokens?: number;
  error?: string;
}

const runCall = async (modelId: string, call: Call): Promise<CallResult> => {
  const started = performance.now();
  try {
    const result = await evaluate({
      maxRetries: MAX_RETRIES,
      model: gateway.evaluationModel(modelId),
      providerOptions: { gateway: { zeroDataRetention: process.env.ZDR !== "0" } },
      questions: call.questions,
      state: call.state as any,
    });
    const ms = performance.now() - started;
    const decisions: Decision[] = [];
    for (const [question, expected] of Object.entries(call.expected)) {
      const a: any = (result.answers as any)[question];
      if (typeof expected === "boolean") {
        const p = a.probability as number;
        decisions.push({
          task: call.task, case: call.case, question, kind: "boolean", expected,
          p, got: p >= 0.5, correct: p >= 0.5 === expected,
        });
      } else {
        decisions.push({
          task: call.task, case: call.case, question, kind: "choice", expected,
          p: a.probabilities?.[a.choice], got: a.choice, correct: a.choice === expected,
        });
      }
    }
    return { decisions, inputTokens: result.usage?.inputTokens, ms };
  } catch (error) {
    return {
      decisions: [],
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      ms: performance.now() - started,
    };
  }
};

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : 0;
};

const summarize = (model: string, lang: Lang, results: CallResult[]) => {
  const ds = results.flatMap((r) => r.decisions);
  const errors = results.filter((r) => r.error);
  const by = (f: (d: Decision) => boolean) => {
    const xs = ds.filter(f);
    return pct(xs.filter((d) => d.correct).length, xs.length);
  };
  const bools = ds.filter((d) => d.kind === "boolean");
  const brier = bools.length
    ? bools.reduce((s, d) => s + (d.p! - (d.expected ? 1 : 0)) ** 2, 0) / bools.length
    : NaN;
  // «Sure» = P(true) ≥ 0.9 or ≤ 0.1 for booleans, P(chosen) ≥ 0.9 for choices with a distribution.
  const sure = ds.filter((d) =>
    d.p === undefined ? false : d.kind === "boolean" ? Math.abs(d.p - 0.5) >= 0.4 : d.p >= 0.9
  );
  const ok = results.filter((r) => !r.error);
  const tokens = ok.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  return {
    model, lang,
    calls: `${ok.length}/${results.length}`,
    gate_remember: by((d) => d.task === "gate" && d.question === "remember"),
    gate_types: by((d) => d.task === "gate" && ["fact", "event", "commitment", "rule"].includes(d.question)),
    gate_direction: by((d) => d.question === "direction"),
    gate_precision: by((d) => d.question === "precision"),
    entity: by((d) => d.task === "entity"),
    closing: by((d) => d.task === "closing"),
    temporal: by((d) => d.task === "temporal"),
    all: by(() => true),
    brier: Number.isNaN(brier) ? "—" : brier.toFixed(3),
    sure: `${pct(sure.length, ds.length)} of answers, ${pct(sure.filter((d) => d.correct).length, sure.length)} right`,
    p50_ms: quantile(ok.map((r) => r.ms), 0.5),
    p95_ms: quantile(ok.map((r) => r.ms), 0.95),
    tokens_per_call: ok.length ? Math.round(tokens / ok.length) : 0,
    first_error: errors[0]?.error?.slice(0, 160),
  };
};

mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
const rows = [];
for (const model of MODELS) {
  for (const lang of LANGS) {
    const calls = buildCalls(lang);
    const results = await pool(calls, CONCURRENCY, (c) => runCall(model, c));
    const row = summarize(model, lang, results);
    rows.push(row);
    console.log(JSON.stringify(row));
    writeFileSync(
      new URL(`./results/${model.replace("/", "__")}.${lang}.json`, import.meta.url),
      JSON.stringify({ row, results }, null, 2)
    );
  }
}
writeFileSync(new URL("./results/summary.json", import.meta.url), JSON.stringify(rows, null, 2));
