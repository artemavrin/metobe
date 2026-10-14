import { listSkills } from "@metobe/core/skills";
import { getTranslations } from "next-intl/server";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { SkillList } from "./skill-list";

// «Скиллы»: the organization's skills in the Agent Skills format — a folder with SKILL.md. The chat offers each
// enabled one by its name and description; the model loads the instructions when a question needs them, and a user
// picks one with `/name`.

const SkillsPage = async () => {
  const [{ admin, user }, t] = await Promise.all([
    getSettingsViewer(),
    getTranslations("skills"),
  ]);
  const rows = user ? await listSkills({ admin, userId: user.id }) : [];
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <SkillList skills={rows.filter((s) => s.ownerId === null)} />
    </SettingsPageFrame>
  );
};

export default SkillsPage;
