// Development only (D43): sends the account bound to a Telegram name a digest of its «Не упустить» rows, with the buttons,
// to see the real message. Telegram only — no mail, no change of the digest's «sent today» flag.
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/telegram-send-check.ts @name
import { activeTelegramChat } from "@metobe/core/channels";
import { getDb } from "@metobe/core/db";
import { digestBlocks } from "@metobe/core/memory-digest";
import { todaySuggestions } from "@metobe/core/memory-today";
import { telegramMessage } from "@metobe/core/notify";
import { sendTelegram } from "@metobe/core/telegram";
import { buttonsFor } from "@metobe/core/telegram-actions";

const [name] = process.argv.slice(2);
const { sql } = getDb();
const [bound] = await sql<{ id: string; time_zone: string | null }[]>`
  select u.id, u.time_zone from user_channels c join "user" u on u.id = c.user_id
  where c.kind = 'telegram' and c.display = ${String(name)} limit 1`;
if (!bound) {
  throw new Error("no account bound to that name");
}
const chat = await activeTelegramChat(bound.id);
if (!chat) {
  throw new Error("the channel is not active");
}
const rows = await todaySuggestions(bound.id, bound.time_zone ?? "UTC");
const shown = rows.slice(0, 5);
const text = telegramMessage({
  blocks:
    shown.length > 0
      ? digestBlocks(
          shown,
          (r) => r.reason,
          (n) => `+${n}`
        )
      : [{ text: "Сейчас в «Не упустить» пусто.", type: "p" }],
  title: "Тест из Metobe: так выглядит сводка",
});
await sendTelegram(chat, text, {
  buttons: buttonsFor(shown, { dismiss: "Убрать", tomorrow: "Завтра" }),
  html: true,
});
console.log(JSON.stringify({ rows: rows.length, sent: true }));
process.exit(0);
