import { modelSlots } from "@metobe/contracts/models";
import {
  getFavoriteModelIds,
  getFirstTokenMedians,
  getRecentModelIds,
  listModelChoices,
} from "@metobe/core/model-choices";
import { getSlotAssignments } from "@metobe/core/model-slots";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { toPickerModel } from "@/lib/model-choice";
import { getSettingsViewer } from "@/lib/settings-access";

import { SlotsForm } from "./slots-form";

const ServicePage = async () => {
  const { user } = await getSettingsViewer();
  const [rows, medians, assigned, favorites, recent, t] = await Promise.all([
    listModelChoices("working"),
    getFirstTokenMedians(),
    getSlotAssignments(),
    user ? getFavoriteModelIds(user.id) : [],
    user ? getRecentModelIds(user.id) : [],
    getTranslations("service"),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <SlotsForm
        assigned={Object.fromEntries(
          modelSlots.map((s) => [s, assigned[s] ?? null])
        )}
        favorites={favorites}
        models={rows.map((row) =>
          toPickerModel(row, medians.get(row.id) ?? null)
        )}
        recent={recent}
      />
    </SettingsPageFrame>
  );
};

export default ServicePage;
