import { getWebSettings } from "@metobe/core/web-settings";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { SearchSettings } from "./search-settings";

const SearchPage = async () => {
  const [settings, t] = await Promise.all([
    getWebSettings(),
    getTranslations("webSearch"),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <SearchSettings settings={settings} />
    </SettingsPageFrame>
  );
};

export default SearchPage;
