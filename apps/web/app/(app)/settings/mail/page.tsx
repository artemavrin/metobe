import { getServiceMail } from "@metobe/core/mail";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { MailSettings } from "./mail-settings";

const MailPage = async () => {
  const [mail, { user }, t] = await Promise.all([
    getServiceMail(),
    getSettingsViewer(),
    getTranslations("serviceMail"),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <MailSettings mail={mail} me={user?.email ?? ""} />
    </SettingsPageFrame>
  );
};

export default MailPage;
