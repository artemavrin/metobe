import { getLastModelIds, listChats } from "@metobe/core/chat";
import { listMailboxes } from "@metobe/core/mailboxes";
import { listChatServers } from "@metobe/core/mcp";
import { todaySuggestions } from "@metobe/core/memory-today";
import { isMemoryOnFor } from "@metobe/core/memory-write";
import { skillsForChat } from "@metobe/core/skills";
import { getFormatter, getTranslations } from "next-intl/server";

import { ChatView } from "@/components/chat/chat-view";
import { FreshChat } from "@/components/chat/fresh-chat";
import { getPickerData } from "@/lib/chat-data";
import { pickModel } from "@/lib/chat-model";
import { dayPart, hourIn } from "@/lib/greeting";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

// A new chat: the welcome over the empty thread and the composer at the bottom. Its id is made in the browser,
// once — a server render (a refresh after a server action) must not start another chat and wipe the draft; the
// first message creates the chat under it and the address becomes /chat/<id> without a reload.
const NewChatPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ say?: string | string[] }>;
}) => {
  const [{ user }, prefs, t, format] = await Promise.all([
    getSettingsViewer(),
    getPrefs(),
    getTranslations("chat.greeting"),
    getFormatter(),
  ]);
  if (!user) {
    return null;
  }
  const [picker, last, servers, chats, boxes, skills, today] =
    await Promise.all([
      getPickerData(user.id),
      getLastModelIds(user.id),
      listChatServers(user.id),
      listChats(user.id),
      listMailboxes(user.id),
      skillsForChat(user.id),
      // «На сегодня» (P17): only while the person's memory is on; a broken read leaves the screen as it was.
      (async () =>
        (await isMemoryOnFor(user.id))
          ? todaySuggestions(user.id, prefs.timeZone).catch(
              (error: unknown) => {
                console.error("memory: could not gather «На сегодня»", error);
                return [];
              }
            )
          : [])(),
    ]);
  const model = pickModel(picker.models, [...last, picker.favorites[0]]);
  // The layout shows «not ready» when chat has no model; a page without one never renders.
  if (!model) {
    return null;
  }
  const now = new Date();
  const name = user.name.trim().split(/\s+/u)[0] ?? "";
  const { say } = await searchParams;
  return (
    <FreshChat>
      <ChatView
        favorites={picker.favorites}
        initialMessages={[]}
        labels={[]}
        model={model}
        models={picker.models}
        recent={picker.recent}
        servers={servers}
        skills={skills.map((s) => ({
          description: s.description,
          id: s.id,
          name: s.name,
          shared: s.ownerId === null,
        }))}
        welcome={{
          first: chats.length === 0,
          greeting: t(dayPart(hourIn(now, prefs.timeZone)), {
            hasName: name ? "yes" : "no",
            name,
          }),
          mailboxes: boxes.map((b) => b.address),
          say: typeof say === "string" ? say.slice(0, 4000) : undefined,
          suggestions: today,
          timeZone: prefs.timeZone,
          today: format.dateTime(now, {
            day: "numeric",
            month: "long",
            timeZone: prefs.timeZone,
            weekday: "long",
          }),
        }}
      />
    </FreshChat>
  );
};

export default NewChatPage;
