import { getAccount } from "@metobe/core/account";
import { getLastModelIds, listChats } from "@metobe/core/chat";
import { listMailboxes } from "@metobe/core/mailboxes";
import { listChatServers } from "@metobe/core/mcp";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";

import { getPickerData } from "@/lib/chat-data";
import { chatGroupOf } from "@/lib/chat-history";
import { pickModel } from "@/lib/chat-model";
import { dayPart, hourIn } from "@/lib/greeting";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

import { Prototype } from "./prototype";

// Both rounds are drawn on the signed-in user's own data, read the way the chat's layout and page read it — their
// chats, models, servers and mailboxes. Nothing is sent: a question shows the answer starting, R brings the empty
// screen back.

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="text-muted-foreground flex min-h-dvh items-center justify-center p-6 text-sm">{children}</div>
);

export const NewChatPrototype = async ({ round }: { round: 1 | 2 }) => {
  const [{ role, user }, prefs, tGreeting, tRoles, format] = await Promise.all([
    getSettingsViewer(),
    getPrefs(),
    getTranslations("chat.greeting"),
    getTranslations("settings.roles"),
    getFormatter(),
  ]);
  if (!user) {
    return (
      <Note>
        <span>
          Прототип рисуется на ваших данных — <Link className="underline underline-offset-4" href="/login">войдите</Link>.
        </span>
      </Note>
    );
  }
  const [list, account, picker, last, servers, boxes] = await Promise.all([
    listChats(user.id),
    getAccount(user.id),
    getPickerData(user.id),
    getLastModelIds(user.id),
    listChatServers(user.id),
    listMailboxes(user.id),
  ]);
  const model = pickModel(picker.models, [...last, picker.favorites[0]]);
  if (!model) {
    return <Note>В чате пока нет ни одной модели — новый чат не откроется.</Note>;
  }
  const now = new Date();
  const pinned = list.filter((c) => c.pinnedAt).sort((a, b) => (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0));
  const chats = [...pinned, ...list.filter((c) => !c.pinnedAt)].map((c) => ({
    group: c.pinnedAt ? ("pinned" as const) : chatGroupOf(c.updatedAt, now, prefs.timeZone),
    id: c.id,
    title: c.title,
  }));
  // The last three by their last message, pinned or not: what «Продолжить» offers.
  const recentChats = [...list]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 3)
    .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
  const name = user.name.trim().split(/\s+/u)[0] ?? "";
  const greeting = tGreeting(dayPart(hourIn(now, prefs.timeZone)), { hasName: name ? "yes" : "no", name });
  const today = format.dateTime(now, { day: "numeric", month: "long", timeZone: prefs.timeZone, weekday: "long" });
  const roleKey = role === "superuser" || role === "admin" ? role : "user";
  return (
    <Prototype
      chats={chats}
      favorites={picker.favorites}
      greeting={greeting}
      mailboxes={boxes.map((b) => b.address)}
      model={model}
      models={picker.models}
      recent={picker.recent}
      recentChats={recentChats}
      round={round}
      sendKey={account?.sendKey === "mod-enter" ? "mod-enter" : "enter"}
      servers={servers}
      today={today}
      user={{ email: user.email, image: user.image ?? null, name: user.name || user.email, role: tRoles(roleKey) }}
    />
  );
};
