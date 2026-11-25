import { getEnv } from "@metobe/core/env";
import {
  availableMemory,
  BUNDLED_GUARD_URL,
  GUARD_MEMORY,
  checkGuard,
  readPrivacySettings,
  guardUrl,
  usesBundledGuard,
} from "@metobe/core/privacy-settings";
import { readGuardRun, updaterAlive } from "@metobe/core/updater-bus";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { PrivacySettingsForm } from "./privacy-settings";

// Data protection (PII-GUARD-PLAN З6, P31): the service is checked each time the section opens.
const PrivacyPage = async () => {
  const { admin, orgId } = await getSettingsViewer();
  if (!orgId) {
    notFound();
  }
  const [settings, t, updater, run, memory] = await Promise.all([
    readPrivacySettings(orgId),
    getTranslations("privacy"),
    updaterAlive(),
    readGuardRun(),
    availableMemory(),
  ]);
  const url = guardUrl(settings);
  const check = await checkGuard(url);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <PrivacySettingsForm
        check={check}
        defaultUrl={
          getEnv().PII_GUARD_URL ??
          (settings.bundled ? BUNDLED_GUARD_URL : null)
        }
        settings={settings}
        setup={{
          bundled: usesBundledGuard(settings),
          lowMemory: memory !== null && memory < GUARD_MEMORY ? memory : null,
          platform: admin,
          run,
          updater: updater !== null,
        }}
      />
    </SettingsPageFrame>
  );
};

export default PrivacyPage;
