import { SANDBOX_DEFAULT_LIMITS } from "@metobe/contracts/sandbox";
import { sandboxConfigured, sandboxStatus } from "@metobe/core/sandbox";
import { getSandboxSettings } from "@metobe/core/sandbox-settings";
import { listUsers } from "@metobe/core/users";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { SandboxSettings } from "./sandbox-settings";

const SandboxPage = async () => {
  const [status, settings, users, t] = await Promise.all([
    sandboxStatus(),
    getSandboxSettings(true),
    listUsers(),
    getTranslations("sandbox"),
  ]);
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <SandboxSettings
        enabled={settings.enabled}
        installed={sandboxConfigured()}
        limits={settings.limits ?? status?.limits ?? SANDBOX_DEFAULT_LIMITS}
        names={names}
        status={status}
      />
    </SettingsPageFrame>
  );
};

export default SandboxPage;
