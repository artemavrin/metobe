// S13 part 6: the writer settles open commitments (done, cancelled, said to be done) and marks «важно» only when the
// message says so (D39, 2026-11-09). Gateway only.

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import { extractionSchema, memoryInstructions, memoryPrompt } from "../../packages/core/src/memory-extract.ts";
import type { OpenCommitment } from "../../packages/core/src/memory-extract.ts";
import { exchange } from "./cases.ts";
import { TIMEZONE, TODAY_ISO } from "./extract-cases.ts";
import { sourceKey } from "./keys.ts";

const MODELS = (process.env.MODELS ?? "google/gemini-3.5-flash").split(",");
const gw = createGateway({ apiKey: sourceKey("gateway").key });

const person = (ref: string, name: string, role: string) =>
  ({ aliases: [], id: ref, kind: "person", name, ref, role }) as const;
const cards = [
  person("olga", "Ольга Ли", "менеджер «Альфа-Логистики»"),
  person("sedov", "Андрей Седов", "коллега, бэкенд"),
  person("lanshin", "Андрей Ланьшин", "коллега, продажи"),
  person("igor", "Игорь Белов", "бухгалтер"),
];
const open = (ref: string, text: string, status: OpenCommitment["status"] = "open"): OpenCommitment => ({
  due: null,
  id: ref,
  ref,
  status,
  text,
});
const commitments = [
  open("k1", "Ольга Ли пришлёт подписанный договор до 13 ноября"),
  open("k2", "Андрей Седов сделает API к 13 ноября"),
  open("k3", "Позвонить Андрею Седову 10 ноября"),
  open("k4", "Отправить Игорю Белову акт сверки"),
  open("k5", "Андрей Ланьшин подготовит презентацию для клиента", "unconfirmed"),
  open("k6", "Встреча с Андреем Ланьшиным 11 ноября по скидкам"),
];
const system = memoryInstructions({
  cards,
  commitments,
  sentAt: new Date(`${TODAY_ISO}T09:00:00Z`),
  timeZone: TIMEZONE,
});

interface Case {
  text: string;
  before?: { user?: string; assistant?: string };
  /** Exactly these settled — ref:status; empty — none. */
  updates: string[];
  /** A new commitment must be (true) or must not be (false) important; undefined — not checked. */
  important?: boolean;
}
const cases: Case[] = [
  { text: "Ольга прислала подписанный договор", updates: ["k1:done"] },
  { text: "Андрей Седов говорит, что API уже готов", updates: ["k2:unconfirmed"] },
  { text: "Седов показал API, всё работает", updates: ["k2:done"] },
  { text: "звонить Седову не надо, он сам написал", updates: ["k3:cancelled"] },
  { text: "отправил Игорю акт сверки", updates: ["k4:done"] },
  { text: "посмотрел презентацию Ланьшина, отличная", updates: ["k5:done"] },
  { text: "встречу с Ланьшиным по скидкам отменили", updates: ["k6:cancelled"] },
  { text: "Седов говорит, API почти готов, доделает завтра", updates: [] },
  { text: "Ольга обещала прислать договор на этой неделе", updates: [] },
  {
    before: { assistant: "Хорошо, позвонить Андрею Седову 10 ноября.", user: "Андрей Седов просил позвонить ему 10 ноября" },
    text: "Андрей передумал",
    updates: ["k3:cancelled"],
  },
  { important: false, text: "Игорь попросил прислать счёт до пятницы", updates: [] },
  { important: true, text: "Срочно, это горит: до среды отправить Ольге Ли реквизиты", updates: [] },
  { important: true, text: "главное на неделе — подготовить отчёт для Игоря Белова к пятнице", updates: [] },
  { important: false, text: "договорились с Седовым: он поправит баг в выгрузке к понедельнику", updates: [] },
];

type Out = (typeof extractionSchema)["_output"];
const verdict = (c: Case, o: Out) => {
  const got = o.updates.map((u) => `${u.ref}:${u.status}`).sort();
  if (got.join() !== [...c.updates].sort().join()) return `updates ${got.join(", ") || "none"}`;
  const fresh = o.items.filter((i) => i.kind === "commitment");
  if (c.important !== undefined) {
    if (fresh.length === 0) return "no new commitment";
    if (fresh.some((i) => i.important !== c.important)) return `important ${fresh.map((i) => i.important).join(",")}`;
  }
  // A settled one is not written again as a new commitment.
  if (c.updates.length > 0 && fresh.length > 0) return `new commitment too: ${fresh.map((i) => i.text).join(" / ")}`;
  return null;
};

for (const id of MODELS) {
  let ok = 0;
  let cost = 0;
  for (const c of cases) {
    const r = await generateText({
      instructions: system,
      maxRetries: 1,
      model: gw(id),
      output: Output.object({ schema: extractionSchema }),
      prompt: memoryPrompt(c.text, exchange(c.before)),
      providerOptions: { gateway: { zeroDataRetention: true } },
      reasoning: "low",
    });
    cost += Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);
    const v = verdict(c, r.output);
    if (v) console.log(`  ✗ ${c.text} → ${v}`);
    else ok++;
  }
  console.log(`${id}: ${ok}/${cases.length}, $${cost.toFixed(4)}`);
}
