// Development only (S19, docs/PII-GUARD-PLAN.md З0): the masking middleware against a live model.
// A Russian request with a mail search and a mail send goes through `getLanguageModel`, which wraps
// the model in the masking middleware (packages/core/src/pii-guard.ts) when PII_GUARD_URL is set: the
// model must get no original value, the send tool must get the real address and names, the answer
// must have no labels.
// All people, addresses and numbers are fictional.
//
//   PII_GUARD_URL=http://127.0.0.1:8797 \  (the guard must be running)
//   cd apps/cli && env -u DATABASE_URL npx tsx --conditions=react-server --env-file=../../.env dev/pii-guard-check.ts

import { getLanguageModel } from "@metobe/core/ai";
import { getDb } from "@metobe/core/db";
import type { MaskedCall } from "@metobe/core/pii-guard";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";

const MODEL = process.env.MODEL ?? "meta/muse-ember";
if (!process.env.PII_GUARD_URL) {
  throw new Error("set PII_GUARD_URL to a running guard");
}
const SESSION = `s19-${crypto.randomUUID().slice(0, 8)}`;

const ORIGINALS = [
  "Ольга",
  "Смирнов",
  "olga.smirnova@example.com",
  "Кузнецов",
  "i.kuznetsov@example.com",
  "+7 916 555-01-23",
  "4510 123456",
];

const seen: MaskedCall[] = [];

const sent: unknown[] = [];
const tools = {
  email_search: tool({
    description: "Поиск писем в почте пользователя. Возвращает список писем.",
    execute: () => [
      {
        date: "2026-11-12",
        from: "Ольга Петровна Смирнова <olga.smirnova@example.com>",
        subject: "Договор поставки",
        text: "Добрый день! Пришлите, пожалуйста, договор на подпись. Со стороны поставщика подписывает Илья Кузнецов (i.kuznetsov@example.com), его телефон +7 916 555-01-23. Паспорт для доверенности: 4510 123456. Ольга",
      },
    ],
    inputSchema: jsonSchema<{ query: string }>({
      properties: { query: { type: "string" } },
      required: ["query"],
      type: "object",
    }),
  }),
  email_send: tool({
    description: "Отправить письмо.",
    execute: (input) => {
      sent.push(input);
      return { ok: true };
    },
    inputSchema: jsonSchema<{
      to: string;
      cc?: string;
      subject: string;
      body: string;
    }>({
      properties: {
        body: { type: "string" },
        cc: { type: "string" },
        subject: { type: "string" },
        to: { type: "string" },
      },
      required: ["to", "subject", "body"],
      type: "object",
    }),
  }),
};

const { sql } = getDb();
const [row] = await sql<
  { source_id: string }[]
>`select source_id from models where model_id = ${MODEL} order by enabled desc limit 1`;
if (!row) {
  throw new Error(`no model ${MODEL} in this installation`);
}
// The production path: getLanguageModel wraps the model itself when PII_GUARD_URL is set.
const model = await getLanguageModel(row.source_id, MODEL, {
  onMasked: (call) => seen.push(call),
  session: SESSION,
});

const started = performance.now();
const result = streamText({
  model,
  prompt:
    "Найди последнее письмо от Смирновой про договор и ответь ей: договор подпишет Кузнецов в пятницу. Копию поставь Кузнецову. Потом коротко скажи, что сделал.",
  stopWhen: stepCountIs(5),
  system: "Ты помощник по почте. Отвечай по-русски, коротко.",
  tools,
});
let answer = "";
let first = 0;
for await (const delta of result.textStream) {
  if (!first) {
    first = performance.now() - started;
  }
  answer += delta;
}
await sql.end();

console.log("\n=== what the model saw (last step) ===");
for (const m of seen.at(-1)?.messages ?? []) {
  const text =
    typeof m.content === "string"
      ? m.content
      : JSON.stringify(m.content ?? m.tool_calls);
  console.log(`[${m.role}] ${text.slice(0, 400)}`);
}
console.log("\n=== entities ===");
for (const e of seen.at(-1)?.entities ?? []) {
  console.log(`${e.type}\t${e.placeholder}\t${e.value}`);
}
console.log("\n=== email_send got ===");
console.log(JSON.stringify(sent, null, 2));
console.log("\n=== answer ===");
console.log(answer);

const leaked = seen.flatMap((s) =>
  ORIGINALS.filter((o) => JSON.stringify(s.messages).includes(o)).map((o) => o)
);
const labelsInTool =
  JSON.stringify(sent).match(/Персон\w*_\w+|\[\[[A-Z_]+_[0-9a-f]+\]\]/gu) ?? [];
const labelsInAnswer =
  answer.match(/Персон\w*_\w+|\[\[[A-Z_]+_[0-9a-f]+\]\]/gu) ?? [];
console.log("\n=== checks ===");
console.log(
  `originals sent to the model: ${leaked.length ? [...new Set(leaked)].join(", ") : "none"}`
);
console.log(
  `email_send called: ${sent.length}; real address: ${JSON.stringify(sent).includes("olga.smirnova@example.com")}`
);
console.log(
  `labels left in tool input: ${labelsInTool.length ? labelsInTool.join(", ") : "none"}`
);
console.log(
  `labels left in answer: ${labelsInAnswer.length ? labelsInAnswer.join(", ") : "none"}`
);
console.log(
  `steps ${seen.length}; guard mask ms ${seen.map((s) => s.ms).join(", ")}; first text ${first.toFixed(0)} ms; total ${(performance.now() - started).toFixed(0)} ms`
);
