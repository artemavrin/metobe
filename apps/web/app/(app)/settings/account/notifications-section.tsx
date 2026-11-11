import {
  notifyPrefs,
  telegramAvailable,
  telegramChannel,
} from "@metobe/core/channels";
import { digestTimeOf } from "@metobe/core/memory-digest";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/settings/rows";

import { NotificationsForm } from "./notifications-form";

/** «Уведомления» (D43): where Metobe tells the person — the mail, a Telegram chat — and the morning digest. */
export const NotificationsSection = async ({
  userId,
  memory,
}: {
  userId: string;
  /** The service has a «Память» model: there is a digest. */
  memory: boolean;
}) => {
  const [t, channel, prefs, digest] = await Promise.all([
    getTranslations("settings.notifications"),
    telegramAvailable() ? telegramChannel(userId) : null,
    notifyPrefs(userId),
    digestTimeOf(userId),
  ]);
  return (
    <Section title={t("title")}>
      <NotificationsForm
        channel={channel}
        digest={digest}
        email={prefs.email}
        memory={memory}
        telegram={telegramAvailable()}
        viaTelegram={prefs.telegram}
      />
    </Section>
  );
};
