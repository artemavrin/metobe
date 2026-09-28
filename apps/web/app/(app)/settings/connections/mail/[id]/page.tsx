import { listMailboxes } from "@metobe/core/mailboxes";
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
  const boxes = await listMailboxes(user.id);
  const box = boxes.find((b) => b.id === id);
  if (!box) {
    notFound();
  }
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
        key={box.id}
      />
    </SettingsPageFrame>
  );
};

export default Page;
