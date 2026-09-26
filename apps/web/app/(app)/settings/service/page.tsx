import { modelSlots } from "@metobe/contracts/models";
import {
  getSlotAssignments,
  listSlotCandidates,
} from "@metobe/core/model-slots";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";

import { SlotsForm } from "./slots-form";

const ServicePage = async () => {
  const [candidates, assigned, t] = await Promise.all([
    listSlotCandidates(),
    getSlotAssignments(),
    getTranslations("service"),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <SlotsForm
        assigned={Object.fromEntries(
          modelSlots.map((s) => [s, assigned[s] ?? null])
        )}
        candidates={candidates.map((c) => ({
          id: c.id,
          inChat: c.inChat,
          logo: c.providerLogo ?? undefined,
          maker: c.providerTitle ?? c.sourceTitle,
          source: c.sourceTitle,
          title: c.title,
        }))}
      />
    </SettingsPageFrame>
  );
};

export default ServicePage;
