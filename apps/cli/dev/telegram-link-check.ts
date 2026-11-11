// Development only (D43): binds a chat to a user as the bot would on «Start», without Telegram.
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/telegram-link-check.ts <user id>
import { completeTelegramLink, startTelegramLink } from "@metobe/core/channels";

const [userId] = process.argv.slice(2);
const link = await startTelegramLink(String(userId));
if (!link.ok) {
  throw new Error(`no link: ${link.reason}`);
}
const code = link.url.split("?start=")[1] ?? "";
console.log(
  JSON.stringify(
    await completeTelegramLink(code, { display: "@check", id: "424242" })
  )
);
process.exit(0);
