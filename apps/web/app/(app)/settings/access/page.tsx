import { domainOf } from "@metobe/contracts/access";
import { getAllowedDomains } from "@metobe/core/access";
import { getServiceMail } from "@metobe/core/mail";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { AccessSettings } from "./access-settings";

const AccessPage = async () => {
  const [domains, mail, t] = await Promise.all([
    getAllowedDomains(),
    getServiceMail(),
    getTranslations("access"),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <AccessSettings
        domains={domains}
        mailOn={mail !== null}
        senderDomain={mail ? domainOf(mail.address) : null}
      />
    </SettingsPageFrame>
  );
};

export default AccessPage;
