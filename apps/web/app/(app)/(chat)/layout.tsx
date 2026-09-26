import { listChats } from "@metobe/core/chat";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ChatShell } from "@/components/chat/chat-shell";
import { getChatModels } from "@/lib/chat-data";
import { chatGroupOf } from "@/lib/chat-history";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

import { NotReady } from "./not-ready";

// The chat's shell (P1 «Режимы»): a floating sidebar with the user's chats, the screen beside it. Chat opens once
// any source puts a model into it; until then an admin sets it up, anyone else waits.
const ChatLayout = async ({ children }: { children: React.ReactNode }) => {
  const [{ admin, role, user }, models, prefs, t] = await Promise.all([
    getSettingsViewer(),
    getChatModels(),
    getPrefs(),
    getTranslations("settings.roles"),
  ]);
  // (app)/layout has sent anyone without a session to /login already.
  if (!user) {
    redirect("/login");
  }
  if (models.length === 0) {
    if (admin) {
      redirect("/onboarding");
    }
    return <NotReady />;
  }
  // Days by the user's calendar, counted here once; the sidebar only keeps the order.
  const now = new Date();
  const list = await listChats(user.id);
  const chats = list.map((chat) => ({
    group: chatGroupOf(chat.updatedAt, now, prefs.timeZone),
    id: chat.id,
    title: chat.title,
  }));
  const roleKey = role === "superuser" || role === "admin" ? role : "user";
  return (
    <ChatShell
      chats={chats}
      user={{ name: user.name || user.email, role: t(roleKey) }}
    >
      {children}
    </ChatShell>
  );
};

export default ChatLayout;
