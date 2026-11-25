// Development only (Д1, MEMORY-UX-PLAN §2.4): does the chat pick `show_card` and `show_promises` where the person asks
// what is going on with someone or what is open — and stay with the reading tools when it only needs to know (a letter,
// advice, a plain fact)? Each line is one question alone, on a memory of its own (a throwaway user in the dev database,
// removed at the end), the chat's own way: `MEMORY_NOTE`, the <memory> block, the reading and the showing tools. What is
// checked is which tools it called, not what it said. Costs ten short calls of the chat's model: cents.
//
//   cd apps/cli && DRY=1 npx tsx --conditions=react-server --env-file=../../.env dev/memory-show-check.ts   — only lists
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-show-check.ts
//   MODEL=… — the model by its id among the installation's models; Muse Ember by default, taken even while it is
//   switched off in the list (a check is not a reason to switch a model on for everyone)

import { getLanguageModel } from "@metobe/core/ai";
import { STYLE_NOTE } from "@metobe/core/chat-tools/answer-style";
import { getDb } from "@metobe/core/db";
import { addRecord, createEntity, ensureSelf } from "@metobe/core/memory";
import {
  SHOW_CARD,
  SHOW_PROMISES,
  memoryBrief,
  memoryShowTools,
  memoryTools,
} from "@metobe/core/memory-read";
import { MEMORY_NOTE } from "@metobe/core/memory-write";
import { testMember } from "@metobe/core/test-organization";
import { user } from "@metobe/db/schema/auth";
import { generateText, stepCountIs } from "ai";

const TIME_ZONE = "Europe/Moscow";
const MODEL = process.env.MODEL ?? "meta/muse-ember";

const day = (n: number) => new Date(Date.now() + n * 86_400_000);

type Show = typeof SHOW_CARD | typeof SHOW_PROMISES | null;

/** `show`: the widget the question calls for; null — none of the two. */
const CASES: { say: string; show: Show }[] = [
  { say: "что у меня с Ириной?", show: SHOW_CARD },
  { say: "расскажи, как дела с Вектором", show: SHOW_CARD },
  { say: "покажи, что открыто по Ирине", show: SHOW_CARD },
  { say: "что горит?", show: SHOW_PROMISES },
  { say: "что я обещал на этой неделе?", show: SHOW_PROMISES },
  { say: "кто мне что должен?", show: SHOW_PROMISES },
  { say: "что просрочено?", show: SHOW_PROMISES },
  { say: "напиши Ирине короткое письмо про план работ на декабрь", show: null },
  { say: "кому из моих лучше поручить подготовку договора?", show: null },
  { say: "кем Ирина работает?", show: null },
];

if (process.env.DRY) {
  for (const c of CASES) {
    console.log(`${c.show ?? "—"}\t${c.say}`);
  }
  console.log(`\n${CASES.length} calls of ${MODEL}; nothing sent (DRY)`);
  process.exit(0);
}

const { db, sql } = getDb();
const [row] = await sql<
  { source_id: string }[]
>`select source_id from models where model_id = ${MODEL} order by enabled desc limit 1`;
if (!row) {
  throw new Error(`no model ${MODEL} in this installation`);
}
const model = await getLanguageModel(row.source_id, MODEL);

const ownerId = `show-check-${crypto.randomUUID().slice(0, 8)}`;
let misses = 0;
try {
  const member = await testMember(db);
  await db.insert(user).values({
    ...member,
    email: `${ownerId}@example.test`,
    id: ownerId,
    name: "Проверка виджетов",
    timeZone: TIME_ZONE,
  });
  const self = await ensureSelf(ownerId, "Проверка виджетов");
  const irina = await createEntity(ownerId, {
    aliases: [],
    kind: "person",
    name: "Ирина Белова",
    role: "заместитель",
  });
  const vector = await createEntity(ownerId, {
    aliases: [],
    kind: "org",
    name: "ООО «Вектор»",
    role: "поставщик",
  });
  const promise = (
    debtor: string,
    creditor: string,
    text: string,
    dueAt: Date
  ) =>
    addRecord(ownerId, {
      dueAt,
      entities: [
        { entityId: debtor, role: "debtor" },
        { entityId: creditor, role: "creditor" },
      ],
      givenAt: day(-5),
      kind: "commitment",
      text,
    });
  await Promise.all([
    promise(irina.id, self.id, "доделать вторую версию портала", day(-2)),
    promise(irina.id, self.id, "прислать план работ на декабрь", day(3)),
    promise(self.id, irina.id, "согласовать её отпуск на январь", day(1)),
    promise(vector.id, self.id, "прислать смету на ремонт склада", day(6)),
    addRecord(ownerId, {
      entities: [{ entityId: irina.id, role: "about" }],
      kind: "fact",
      text: "ведёт вторую версию портала",
    }),
  ]);
  const tools = {
    ...memoryTools(ownerId, TIME_ZONE),
    ...memoryShowTools(ownerId, TIME_ZONE),
  };
  for (const c of CASES) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one question after another, each alone
    const brief = await memoryBrief(ownerId, c.say, TIME_ZONE);
    // oxlint-disable-next-line eslint/no-await-in-loop -- one question after another, each alone
    const result = await generateText({
      instructions: [STYLE_NOTE, MEMORY_NOTE].join("\n\n"),
      messages: [
        {
          content: [
            ...(brief ? [{ text: brief, type: "text" as const }] : []),
            { text: c.say, type: "text" as const },
          ],
          role: "user",
        },
      ],
      model,
      providerOptions: { gateway: { zeroDataRetention: true } },
      stopWhen: stepCountIs(5),
      tools,
    });
    const called = result.steps.flatMap((s) =>
      s.toolCalls.map((call) => call.toolName)
    );
    const shown = called.filter((n) => n === SHOW_CARD || n === SHOW_PROMISES);
    const right = c.show === null ? shown.length === 0 : shown.includes(c.show);
    misses += right ? 0 : 1;
    console.log(
      `${right ? "✓" : "✗"} ${c.say}\n   wanted ${c.show ?? "no widget"}; called ${called.join(", ") || "nothing"}`
    );
  }
  console.log(
    `\n${MODEL}: ${CASES.length - misses}/${CASES.length} questions got the right widget (goal: 9 of 10)`
  );
  process.exitCode = CASES.length - misses >= 9 ? 0 : 1;
} finally {
  await sql`delete from "user" where id = ${ownerId}`;
  await sql.end();
  process.exit();
}
