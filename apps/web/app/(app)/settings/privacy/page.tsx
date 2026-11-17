import { getEnv } from "@metobe/core/env";
import {
  checkGuard,
  getPrivacySettings,
  guardUrl,
} from "@metobe/core/privacy-settings";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { PrivacySettingsForm } from "./privacy-settings";

// Data protection (PII-GUARD-PLAN З6, P31): the service is checked each time the section opens.
const PrivacyPage = async () => {
  const [settings, t] = await Promise.all([
    getPrivacySettings(),
    getTranslations("privacy"),
  ]);
  const url = guardUrl(settings);
  const check = await checkGuard(url);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <PrivacySettingsForm
        check={check}
        defaultUrl={getEnv().PII_GUARD_URL ?? null}
        settings={settings}
      />
    </SettingsPageFrame>
  );
};

export default PrivacyPage;
