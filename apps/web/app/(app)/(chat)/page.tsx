import { getLastModelIds, listChats } from "@metobe/core/chat";
import { listMailboxes } from "@metobe/core/mailboxes";
import { listChatServers } from "@metobe/core/mcp";
import { getFormatter, getTranslations } from "next-intl/server";

import { ChatView } from "@/components/chat/chat-view";
import { getPickerData } from "@/lib/chat-data";
import { pickModel } from "@/lib/chat-model";
import { dayPart, hourIn } from "@/lib/greeting";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

/** How many of the last chats a new chat offers to go back to. */
const RESUME = 3;

// A new chat: the welcome over the empty thread and the composer at the bottom. Its id is made in the browser,
// once — a server render (a refresh after a server action) must not start another chat and wipe the draft; the
// first message creates the chat under it and the address becomes /chat/<id> without a reload.
const NewChatPage = async () => {
  const [{ user }, prefs, t, format] = await Promise.all([
    getSettingsViewer(),
    getPrefs(),
    getTranslations("chat.greeting"),
    getFormatter(),
  ]);
  if (!user) {
    return null;
  }
  const [picker, last, servers, chats, boxes] = await Promise.all([
    getPickerData(user.id),
    getLastModelIds(user.id),
    listChatServers(user.id),
    listChats(user.id),
    listMailboxes(user.id),
  ]);
  const model = pickModel(picker.models, [...last, picker.favorites[0]]);
  // The layout shows «not ready» when chat has no model; a page without one never renders.
  if (!model) {
    return null;
  }
  const now = new Date();
  const name = user.name.trim().split(/\s+/u)[0] ?? "";
  // The last chats by their last message, pinned or not; times are worded here, so the browser draws the same.
  const recent = [...chats]
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, RESUME)
    .map((c) => ({
      ago: format.relativeTime(c.updatedAt, now),
      id: c.id,
      title: c.title,
    }));
  return (
    <ChatView
      favorites={picker.favorites}
      initialMessages={[]}
      labels={[]}
      model={model}
      models={picker.models}
      recent={picker.recent}
      servers={servers}
      welcome={{
        greeting: t(dayPart(hourIn(now, prefs.timeZone)), {
          hasName: name ? "yes" : "no",
          name,
        }),
        mailboxes: boxes.map((b) => b.address),
        recent,
        today: format.dateTime(now, {
          day: "numeric",
          month: "long",
          timeZone: prefs.timeZone,
          weekday: "long",
        }),
      }}
    />
  );
};

export default NewChatPage;
