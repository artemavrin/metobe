import { getAccount } from "@metobe/core/account";
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
  const [list, account] = await Promise.all([
    listChats(user.id),
    getAccount(user.id),
  ]);
  // The pinned first, the latest pinned on top of them; the rest keep the order of their last message.
  // toSorted is past the ES2022 target; the filter gives a fresh array to sort.
  const pinned = list
    .filter((chat) => chat.pinnedAt)
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
    .sort(
      (a, b) => (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0)
    );
  const chats = [...pinned, ...list.filter((chat) => !chat.pinnedAt)].map(
    (chat) => ({
      group: chat.pinnedAt
        ? ("pinned" as const)
        : chatGroupOf(chat.updatedAt, now, prefs.timeZone),
      id: chat.id,
      title: chat.title,
    })
  );
  const roleKey = role === "superuser" || role === "admin" ? role : "user";
  return (
    <ChatShell
      chats={chats}
      sendKey={account?.sendKey === "mod-enter" ? "mod-enter" : "enter"}
      user={{
        email: user.email,
        image: user.image ?? null,
        name: user.name || user.email,
        role: t(roleKey),
      }}
    >
      {children}
    </ChatShell>
  );
};

export default ChatLayout;
