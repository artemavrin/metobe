import { storageUsage } from "@metobe/core/files";
import { checkStorage, describeStorage } from "@metobe/core/storage";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { StorageSettings } from "./storage-settings";

const StoragePage = async () => {
  const [info, state, usage, t] = await Promise.all([
    Promise.resolve(describeStorage()),
    checkStorage(),
    storageUsage(),
    getTranslations("storage"),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <StorageSettings info={info} state={state} usage={usage} />
    </SettingsPageFrame>
  );
};

export default StoragePage;
