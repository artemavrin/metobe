// Development only (D47, P33/P34): a throwaway user with one chat whose answer handed over files made in the sandbox —
// a sheet, a document, a chart, slides, a note — for a browser check of the file cards and the file panel. No model:
// the sandbox tools are called directly, so the files are real (made by the box, stored in S3, rows in `files`).
// Needs the sandbox service up and SANDBOX_URL / SANDBOX_TOKEN set. Prints the user, the chat and a sign-in code.
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/sandbox-files-check.ts seed | code <id> | drop <id>

import { createAuth } from "@metobe/core/auth";
import { createChat, deleteChat, saveMessages } from "@metobe/core/chat";
import { sandboxSession } from "@metobe/core/chat-tools/sandbox-tools";
import { getDb } from "@metobe/core/db";
import { user } from "@metobe/db/schema/auth";

const [mode, given] = process.argv.slice(2);
const { db, sql } = getDb();

if (mode === "drop") {
  const id = String(given);
  const rows = await sql<
    { id: string }[]
  >`select id from chats where user_id = ${id}`;
  for (const row of rows) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one chat, once
    await deleteChat(id, row.id);
  }
  await sql`delete from "user" where id = ${id}`;
  console.log("dropped", id);
  process.exit(0);
}

if (mode === "code") {
  const code = await createAuth().api.createVerificationOTP({
    body: { email: `${String(given)}@example.test`, type: "sign-in" },
  });
  console.log(JSON.stringify({ code }));
  process.exit(0);
}

const id = `sandbox-check-${crypto.randomUUID().slice(0, 8)}`;
const email = `${id}@example.test`;
await db
  .insert(user)
  .values({ email, id, name: "Проверка файлов", timeZone: "Europe/Moscow" });
const chatId = crypto.randomUUID();
await createChat({ id: chatId, title: "Выручка по месяцам", userId: id });

const CODE = `import pandas as pd, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from docx import Document
from pptx import Presentation

months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь"]
df = pd.DataFrame({"Месяц": months, "Выручка": [120000 + i * 17500 for i in range(6)], "Заказы": [310 + i * 22 for i in range(6)]})
df["Средний чек"] = (df["Выручка"] / df["Заказы"]).round()
raw = pd.DataFrame({"Дата": pd.date_range("2026-01-01", periods=60, freq="3D"), "Сумма": [1500 + (i * 731) % 9000 for i in range(60)]})
with pd.ExcelWriter("выручка-по-месяцам.xlsx") as w:
    df.to_excel(w, sheet_name="Итоги", index=False)
    raw.to_excel(w, sheet_name="Исходные", index=False)

fig, ax = plt.subplots(figsize=(8, 4.5), dpi=120)
ax.fill_between(range(6), df["Выручка"], alpha=0.15)
ax.plot(range(6), df["Выручка"], linewidth=2)
ax.set_xticks(range(6), [m[:3] for m in months])
ax.set_title("Выручка по месяцам, ₽", loc="left")
fig.tight_layout()
fig.savefig("выручка-график.png")

doc = Document()
doc.add_heading("Итоги полугодия", 0)
doc.add_paragraph("Выручка росла шесть месяцев подряд: с 120 000 в январе до 207 500 в июне.")
t = doc.add_table(rows=1, cols=2)
t.rows[0].cells[0].text, t.rows[0].cells[1].text = "Месяц", "Выручка"
for m, v in zip(months, df["Выручка"]):
    r = t.add_row().cells; r[0].text, r[1].text = m, f"{v:,}".replace(",", " ")
doc.save("итоги-полугодия.docx")

prs = Presentation()
for title in ["Выручка за полгода", "Что выросло", "Дальше"]:
    s = prs.slides.add_slide(prs.slide_layouts[1]); s.shapes.title.text = title
prs.save("обзор.pptx")

open("выводы.md", "w").write("# Выводы\\n\\n- Рост держится шесть месяцев подряд.\\n- Средний чек почти не меняется: растёт число заказов.\\n")
print(df.tail(3).to_string(index=False))`;

const session = sandboxSession({
  chatId,
  class: "chat",
  fileIds: [],
  userId: id,
});
const call = { messages: [], toolCallId: "check" } as never;
const ran = await session.tools.run_code.execute?.({ code: CODE }, call);
const names = [
  "выручка-график.png",
  "выручка-по-месяцам.xlsx",
  "итоги-полугодия.docx",
  "обзор.pptx",
  "выводы.md",
];
const shared = await Promise.all(
  names.map((name) =>
    session.tools.share_file.execute?.({ path: `/workspace/${name}` }, call)
  )
);
await session.release(false);

const now = Date.now();
await saveMessages(chatId, [
  {
    id: crypto.randomUUID(),
    metadata: { createdAt: new Date(now - 60_000).toISOString() },
    parts: [
      {
        text: "Посчитай выручку по месяцам и сделай Excel, отчёт, график и короткую презентацию",
        type: "text",
      },
    ],
    role: "user",
  },
  {
    id: crypto.randomUUID(),
    metadata: { createdAt: new Date(now).toISOString() },
    parts: [
      { type: "step-start" },
      {
        input: { code: CODE },
        output: ran,
        state: "output-available",
        toolCallId: "run-1",
        type: "tool-run_code",
      },
      ...shared.map((output, i) => ({
        input: { path: `/workspace/${names[i]}` },
        output,
        state: "output-available",
        toolCallId: `share-${i}`,
        type: "tool-share_file",
      })),
      {
        text: "Выручка растёт шесть месяцев подряд: с 120 тысяч в январе до 207 тысяч в июне. Свёл итоги в таблицу, написал отчёт, нарисовал график и собрал обзор на три слайда.",
        type: "text",
      },
    ],
    role: "assistant",
  },
] as never);

const code = await createAuth().api.createVerificationOTP({
  body: { email, type: "sign-in" },
});
console.log(JSON.stringify({ chatId, code, email, id, ran, shared }));
process.exit(0);
