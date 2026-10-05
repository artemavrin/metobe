import { getChatLimits } from "@metobe/core/chat-limits";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { LimitsSettings } from "./limits-settings";

const LimitsPage = async () => {
  const [limits, t] = await Promise.all([
    getChatLimits(),
    getTranslations("limits"),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <LimitsSettings limits={limits} />
    </SettingsPageFrame>
  );
};

export default LimitsPage;
