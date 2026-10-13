import { domainOf } from "@metobe/contracts/access";
import { getAllowedDomains } from "@metobe/core/access";
import { getServiceMail } from "@metobe/core/mail";
import { getPersonalPolicy } from "@metobe/core/personal";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { AccessSettings } from "./access-settings";
import { PersonalSettings } from "./personal-settings";

const AccessPage = async () => {
  const [domains, mail, personal, t] = await Promise.all([
    getAllowedDomains(),
    getServiceMail(),
    getPersonalPolicy(),
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
      <PersonalSettings approvals={personal.approvals} mode={personal.mode} />
    </SettingsPageFrame>
  );
};

export default AccessPage;
