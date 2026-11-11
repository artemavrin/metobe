// Development only (ARCH §19.5): how the chat talks about what it remembers. A short talk about one person goes the
// chat's own way — `MEMORY_NOTE`, the <memory> block in front of each message, the memory's tools — and each answer
// is checked for the store's words («по памяти», «запись», «обязательство», «зафиксировать») and for offers to
// record what is kept by itself. Between the turns the memory gets what the writer would have kept, as in the app.
// A throwaway user in the dev database, removed at the end. Costs a few calls of the chat's model.
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-voice-check.ts
//   MODEL=deepseek/deepseek-v4-flash-0731 RUNS=2 … — the model by its id among the installation's models

import { getLanguageModel } from "@metobe/core/ai";
import { STYLE_NOTE } from "@metobe/core/chat-tools/answer-style";
import { getDb } from "@metobe/core/db";
import { addRecord, createEntity, ensureSelf } from "@metobe/core/memory";
import { memoryBrief, memoryTools } from "@metobe/core/memory-read";
import { MEMORY_NOTE } from "@metobe/core/memory-write";
import { user } from "@metobe/db/schema/auth";
import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";

const TIME_ZONE = "Europe/Moscow";
const MODEL = process.env.MODEL ?? "deepseek/deepseek-v4-flash-0731";
const RUNS = Number(process.env.RUNS ?? 1);

/** The store's words: a person who works with the user does not talk in them. */
const STORE =
  /по памяти|в памяти|из памяти|памят[ьи] (?:нет|ничего)|запис(?:ь|и|ей|ям|ях)(?![а-яё])|зафиксир|обязательств|карточк|заметк|в списке задач/iu;
/** An offer to record, or a claim to have recorded: the memory keeps itself after the answer. */
const OFFER =
  /могу (?:записать|зафиксировать|запомнить|добавить|отметить|сохранить|внести)|(?:записать|зафиксировать|сохранить|добавить|внести)\?|записал|записала|сохранил|внёс|отметил себе/iu;

/** A promise to act later: the chat answers only when the user writes. */
const LATER = /напомню|прослежу|отслежу|проконтролирую|подправлю|дам знать/iu;

interface Turn {
  say: string;
  /** What the writer keeps after this turn's answer. */
  kept?: (ids: {
    owner: string;
    self: string;
    card: string;
  }) => Promise<unknown>;
  /** Has to be in the answer. */
  has?: RegExp;
  not: RegExp[];
}

const today = new Date();
const TURNS: Turn[] = [
  { has: /заместител/iu, not: [STORE], say: "кто такая Ирина?" },
  {
    kept: ({ card, owner, self }) =>
      Promise.all([
        addRecord(owner, {
          entities: [{ entityId: card, role: "about" }],
          kind: "fact",
          text: "делает вторую версию портала",
        }),
        addRecord(owner, {
          dueAt: today,
          entities: [
            { entityId: card, role: "debtor" },
            { entityId: self, role: "creditor" },
          ],
          givenAt: today,
          kind: "commitment",
          text: "доделать вторую версию портала",
        }),
      ]),
    not: [STORE, OFFER, LATER],
    say: "она сейчас делает вторую версию портала, обещала сегодня доделать",
  },
  {
    not: [STORE, OFFER, LATER],
    say: "а я ей обещал протестировать",
  },
  // Asked to remember: «запомню» is fine, the store's words are not.
  {
    not: [STORE, LATER],
    say: "запомни: Ирина не любит звонки, ей лучше писать",
  },
  // Not known: said plainly, not as a report on the store.
  { not: [STORE], say: "когда у неё день рождения?" },
];

const { db, sql } = getDb();
const [row] = await sql<
  { source_id: string }[]
>`select source_id from models where model_id = ${MODEL} and enabled limit 1`;
if (!row) {
  throw new Error(`no model ${MODEL} in this installation`);
}
const model = await getLanguageModel(row.source_id, MODEL);

let misses = 0;
const owners: string[] = [];
try {
  for (let run = 0; run < RUNS; run += 1) {
    // A talk starts with a memory of its own: a new person each run.
    const ownerId = `voice-check-${crypto.randomUUID().slice(0, 8)}`;
    owners.push(ownerId);
    // oxlint-disable-next-line eslint/no-await-in-loop -- one talk after another
    await db.insert(user).values({
      email: `${ownerId}@example.test`,
      id: ownerId,
      name: "Проверка речи",
      timeZone: TIME_ZONE,
    });
    // oxlint-disable-next-line eslint/no-await-in-loop -- one talk after another
    const self = await ensureSelf(ownerId, "Проверка речи");
    // oxlint-disable-next-line eslint/no-await-in-loop -- one talk after another
    const card = await createEntity(ownerId, {
      aliases: [],
      kind: "person",
      name: "Ирина Белова",
      role: "заместитель",
    });
    // oxlint-disable-next-line eslint/no-await-in-loop -- one talk after another
    await addRecord(ownerId, {
      entities: [{ entityId: card.id, role: "about" }],
      kind: "fact",
      text: "работает в команде пользователя",
    });
    const history: ModelMessage[] = [];
    for (const turn of TURNS) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a talk: each turn follows the answer before it
      const brief = await memoryBrief(ownerId, turn.say, TIME_ZONE);
      const asked: ModelMessage = {
        content: [
          ...(brief ? [{ text: brief, type: "text" as const }] : []),
          { text: turn.say, type: "text" as const },
        ],
        role: "user",
      };
      // oxlint-disable-next-line eslint/no-await-in-loop -- a talk: each turn follows the answer before it
      const result = await generateText({
        instructions: [STYLE_NOTE, MEMORY_NOTE].join("\n\n"),
        messages: [...history, asked],
        model,
        providerOptions: { gateway: { zeroDataRetention: true } },
        stopWhen: stepCountIs(5),
        tools: memoryTools(ownerId, TIME_ZONE),
      });
      const answer = result.text.trim();
      const wrong = [
        ...turn.not.flatMap((re) => {
          const found = re.exec(answer);
          return found ? [`«${found[0]}»`] : [];
        }),
        ...(turn.has && !turn.has.test(answer) ? [`no ${turn.has}`] : []),
      ];
      misses += wrong.length > 0 ? 1 : 0;
      console.log(`\n> ${turn.say}`);
      console.log(answer);
      console.log(wrong.length > 0 ? `  ✗ ${wrong.join(", ")}` : "  ✓");
      // As the chat keeps it: the message without the block, then the answer.
      history.push(
        { content: turn.say, role: "user" },
        { content: answer, role: "assistant" }
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- a talk: each turn follows the answer before it
      await turn.kept?.({ card: card.id, owner: ownerId, self: self.id });
    }
  }
  const total = TURNS.length * RUNS;
  console.log(
    `\n${MODEL}: ${total - misses}/${total} answers in a person's words`
  );
  process.exitCode = misses === 0 ? 0 : 1;
} finally {
  await sql`delete from "user" where id in ${sql(owners)}`;
  await sql.end();
  process.exit();
}
