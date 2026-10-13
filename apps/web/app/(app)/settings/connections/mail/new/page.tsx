import { getPersonalPolicy } from "@metobe/core/personal";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { NewMailbox } from "../new-mailbox";

// «Добавить почту» in «Мои подключения»: the same form as the chat's «connect to go on».
const NewMailboxPage = async () => {
  const [t, tf, personal] = await Promise.all([
    getTranslations("mail.page"),
    getTranslations("mail.form"),
    getPersonalPolicy(),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <div className="max-w-xl">
        {personal.mode === "off" ? (
          <Alert>
            <CircleAlert />
            <AlertDescription>{tf("problems.off")}</AlertDescription>
          </Alert>
        ) : (
          <NewMailbox />
        )}
      </div>
    </SettingsPageFrame>
  );
};

export default NewMailboxPage;
