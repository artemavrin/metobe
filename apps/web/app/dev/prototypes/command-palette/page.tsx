import { listChats, listMessages } from "@metobe/core/chat";
import type { ChatMessage } from "@metobe/contracts/chat";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { SETTINGS_NAV } from "@/lib/settings-nav";
import { getSettingsViewer } from "@/lib/settings-access";

import { Prototype } from "./prototype";
import type { PaletteChat, PaletteSection } from "./data";

// P11 · «Палитра ⌘K»: one place to jump anywhere — a chat by its title or words, a settings section, an action.
// Drawn on the signed-in user's own chats and the sections their role opens; nothing is changed or sent.

const SNIPPET_CHATS = 40;

const textOf = (m?: ChatMessage) =>
  (m?.parts ?? [])
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join(" ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, 280);

const CommandPalettePrototypePage = async () => {
  const { admin, user } = await getSettingsViewer();
  if (!user) {
    return (
      <div className="text-muted-foreground flex min-h-dvh items-center justify-center p-6 text-sm">
        <span>
          Прототип рисуется на ваших данных —{" "}
          <Link className="underline underline-offset-4" href="/login">
            войдите
          </Link>
          .
        </span>
      </div>
    );
  }
  const [list, t] = await Promise.all([listChats(user.id), getTranslations("settings")]);
  // The newest chats carry their first question and the start of their last answer: what the preview and the
  // search by words read. Older ones are found by title only — enough to judge the idea.
  const chats: PaletteChat[] = await Promise.all(
    list.map(async (c, i) => {
      const messages = i < SNIPPET_CHATS ? await listMessages(c.id) : [];
      return {
        answer: textOf(messages.filter((m) => m.role === "assistant").at(-1)),
        id: c.id,
        pinned: Boolean(c.pinnedAt),
        question: textOf(messages.find((m) => m.role === "user")),
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      };
    })
  );
  const sections: PaletteSection[] = SETTINGS_NAV.filter((g) => g.scope === "user" || admin).flatMap((g) =>
    g.items.map((item) => ({
      admin: g.scope === "admin",
      group: t(`groups.${g.key}`),
      hint: t(`sections.${item.id}.hint`),
      id: item.id,
      label: t(`sections.${item.id}.label`),
    }))
  );
  return <Prototype chats={chats} sections={sections} />;
};

export default CommandPalettePrototypePage;
