import { listSkills } from "@metobe/core/skills";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { SkillList } from "../skills/skill-list";

// «Мои скиллы»: the user's own skills, seen by them alone. One with the name of an organization's skill stands in for
// it in their chats.

const MySkillsPage = async () => {
  const [{ admin, user }, t] = await Promise.all([
    getSettingsViewer(),
    getTranslations("skills"),
  ]);
  const rows = user ? await listSkills({ admin, userId: user.id }) : [];
  return (
    <SettingsPageFrame>
      <SettingsHeader
        description={t("personalDescription")}
        title={t("personalTitle")}
      />
      <SkillList
        scope="personal"
        skills={rows.filter((s) => s.ownerId === user?.id)}
      />
    </SettingsPageFrame>
  );
};

export default MySkillsPage;
