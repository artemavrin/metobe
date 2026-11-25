import { listMailboxes } from "@metobe/core/mailboxes";
import { listMailWaits } from "@metobe/core/memory";
import { isMemoryOnFor } from "@metobe/core/memory-write";
import { getPersonalPolicyOf } from "@metobe/core/personal";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SettingsPageFrame } from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { MailboxPage } from "../mailbox-page";

// One mailbox of «Мои подключения»: only the user's own; the password never leaves the server.
const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const [{ id }, { user }] = await Promise.all([params, getSettingsViewer()]);
  if (!(user && z.uuid().safeParse(id).success)) {
    notFound();
  }
  const [boxes, personal, memoryOn] = await Promise.all([
    listMailboxes(user.id),
    getPersonalPolicyOf(user.id),
    isMemoryOnFor(user.id),
  ]);
  const box = boxes.find((b) => b.id === id);
  if (!box) {
    notFound();
  }
  // «Замечать письма без ответа» (Г3.1): only while the memory is on; how many letters of this box have no answer.
  const letters = memoryOn ? await listMailWaits(user.id).catch(() => []) : [];
  const waits = letters.filter((w) => w.mailboxId === box.id).length;
  return (
    <SettingsPageFrame>
      <MailboxPage
        box={{
          address: box.address,
          id: box.id,
          imap: box.imap,
          lastError: box.lastError,
          lastUsedAt: box.lastUsedAt?.toISOString() ?? null,
          preset: box.preset,
          smtp: box.smtp,
          status: box.status,
          toolPolicy: box.toolPolicy,
          username: box.username,
        }}
        defaults={personal.approvals}
        key={box.id}
        memory={
          memoryOn
            ? {
                checkedAt: box.memoryCheckedAt?.toISOString() ?? null,
                error: box.memoryError,
                on: box.memoryReads,
                waits,
              }
            : null
        }
        off={personal.mode === "off"}
      />
    </SettingsPageFrame>
  );
};

export default Page;
