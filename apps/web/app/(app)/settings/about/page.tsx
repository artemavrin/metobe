import { getUpdateAutomation } from "@metobe/core/update-automation";
import { listUpdates } from "@metobe/core/update-history";
import { readUpdateRun, updaterAlive } from "@metobe/core/updater-bus";
import { getUpdates } from "@metobe/core/updates";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { AboutCard } from "./about-card";
import { Automation } from "./automation";
import { History } from "./history";

// «О системе» (D35, prototype /dev/prototypes/updates «Карточка»): the version this server runs and, when GitHub has a
// newer one, what is in it and how to put it on — the updater's button, or the installer's command without one; the
// update's steps while it runs, and the history. The layout turns a non-admin away; the page checks again, since a
// layout and its page render side by side.
const AboutPage = async () => {
  const [{ admin }, t] = await Promise.all([
    getSettingsViewer(),
    getTranslations("about"),
  ]);
  if (!admin) {
    notFound();
  }
  const [updates, updater, lastRun, history, automation] = await Promise.all([
    getUpdates(),
    updaterAlive(),
    readUpdateRun(),
    listUpdates(),
    getUpdateAutomation(),
  ]);
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <AboutCard
        lastRun={lastRun}
        now={new Date().toISOString()}
        updater={updater}
        updates={updates}
      />
      <Automation settings={automation} />
      <History current={updates.current} entries={history} updater={updater} />
    </SettingsPageFrame>
  );
};

export default AboutPage;
