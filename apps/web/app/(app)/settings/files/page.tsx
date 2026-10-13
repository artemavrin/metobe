import { listUserFiles, pruneDrafts } from "@metobe/core/files";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { FileList } from "./file-list";

// «Мои файлы»: what the user sent in their chats, newest first, each with its chat. A file goes with its chat —
// taken out alone, its message would point at nothing.

const FilesPage = async () => {
  const [{ user }, t] = await Promise.all([
    getSettingsViewer(),
    getTranslations("myFiles"),
  ]);
  if (user) {
    // Drafts nobody sent are not the user's files: they go before the list is read.
    await pruneDrafts(user.id).catch((error) =>
      console.error("files: could not prune drafts", error)
    );
  }
  const rows = user ? await listUserFiles(user.id) : [];
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <FileList
        files={rows.map((r) => ({
          chatId: r.chatId as string,
          chatTitle: r.chatTitle,
          createdAt: r.createdAt.toISOString(),
          id: r.id,
          kind: r.kind,
          name: r.name,
          size: r.size,
        }))}
      />
    </SettingsPageFrame>
  );
};

export default FilesPage;
