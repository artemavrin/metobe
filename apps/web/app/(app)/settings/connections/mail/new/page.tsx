import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { NewMailbox } from "../new-mailbox";

// «Добавить почту» in «Мои подключения»: the same form as the chat's «connect to go on».
const NewMailboxPage = async () => {
  const t = await getTranslations("mail.page");
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <div className="max-w-xl">
        <NewMailbox />
      </div>
    </SettingsPageFrame>
  );
};

export default NewMailboxPage;
