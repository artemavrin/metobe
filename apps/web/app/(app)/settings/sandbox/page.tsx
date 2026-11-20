import { sandboxConfigured, sandboxStatus } from "@metobe/core/sandbox";
import { listUsers } from "@metobe/core/users";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { SandboxSettings } from "./sandbox-settings";

const SandboxPage = async () => {
  const [status, users, t] = await Promise.all([
    sandboxStatus(),
    listUsers(),
    getTranslations("sandbox"),
  ]);
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <SandboxSettings
        installed={sandboxConfigured()}
        names={names}
        status={status}
      />
    </SettingsPageFrame>
  );
};

export default SandboxPage;
