import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getPrefs } from "@/lib/prefs";

import { RegionForm } from "./region-form";

const RegionPage = async () => {
  const [prefs, t] = await Promise.all([getPrefs(), getTranslations("region")]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <RegionForm
        chosen={prefs.chosen}
        locale={prefs.locale}
        timeZones={Intl.supportedValuesOf("timeZone")}
      />
    </SettingsPageFrame>
  );
};

export default RegionPage;
