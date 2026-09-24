import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { ThemePicker } from "./theme-picker";

const AppearancePage = async () => {
  const t = await getTranslations("settings.appearance");
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <ThemePicker />
    </SettingsPageFrame>
  );
};

export default AppearancePage;
