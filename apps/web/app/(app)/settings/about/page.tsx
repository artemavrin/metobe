import { getUpdates } from "@metobe/core/updates";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { AboutCard } from "./about-card";

// «О системе» (D35, prototype /dev/prototypes/updates «Карточка»): the version this server runs and, when GitHub has a
// newer one, what is in it and how to put it on. The layout turns a non-admin away; the page checks again, since a
// layout and its page render side by side.
const AboutPage = async () => {
  const [{ admin }, t] = await Promise.all([
    getSettingsViewer(),
    getTranslations("about"),
  ]);
  if (!admin) {
    notFound();
  }
  const updates = await getUpdates();
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <AboutCard now={new Date().toISOString()} updates={updates} />
    </SettingsPageFrame>
  );
};

export default AboutPage;
