import { getAccount } from "@metobe/core/account";
import { isMailConfigured } from "@metobe/core/mail";
import { memoryStateFor } from "@metobe/core/memory-write";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

import { Section } from "@/components/settings/rows";
import { SettingsPageFrame } from "@/components/settings/settings-shell";
import { getAuth } from "@/lib/auth";
import { deviceOf, shownIp } from "@/lib/device";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

import { DataForm, DangerForm } from "./data-form";
import { AccountHeader } from "./header";
import { MemoryForm } from "./memory-form";
import { ModelForm } from "./model-form";
import { NotificationsSection } from "./notifications-section";
import { RegionForm } from "./region-form";
import { Sessions } from "./sessions";
import { ThemePicker } from "./theme-picker";

// One screen for the whole account (prototype «Сплошная»): who the user is, how it looks, what the model is told,
// where the account is signed in, the data — one under another, in the order of use.

const AccountPage = async () => {
  const { user, role } = await getSettingsViewer();
  const requestHeaders = await headers();
  const [
    t,
    tAppearance,
    tModel,
    tMemory,
    current,
    all,
    account,
    prefs,
    mailOn,
    memory,
  ] = await Promise.all([
    getTranslations("data"),
    getTranslations("settings.appearance"),
    getTranslations("personalization"),
    getTranslations("memory"),
    getAuth().api.getSession({ headers: requestHeaders }),
    getAuth().api.listSessions({ headers: requestHeaders }),
    user ? getAccount(user.id) : null,
    getPrefs(),
    isMailConfigured(),
    user ? memoryStateFor(user.id) : null,
  ]);
  if (!user) {
    return null;
  }
  return (
    <SettingsPageFrame>
      <AccountHeader
        canChangeEmail={mailOn}
        email={user.email}
        image={user.image ?? null}
        name={user.name}
        role={role}
      />
      <Section title={tAppearance("title")}>
        <ThemePicker />
      </Section>
      <RegionForm
        chosen={prefs.chosen}
        locale={prefs.locale}
        timeZones={Intl.supportedValuesOf("timeZone")}
      />
      <Section title={tModel("aboutTitle")}>
        <ModelForm
          instructions={account?.instructions ?? ""}
          sendKey={account?.sendKey === "mod-enter" ? "mod-enter" : "enter"}
        />
      </Section>
      {/* Only while the service has a «Память» model: without one there is nothing to turn on (ARCH §19.1). */}
      {memory?.service && (
        <div id="memory">
          <Section title={tMemory("settingsTitle")}>
            <MemoryForm on={memory.on} />
          </Section>
        </div>
      )}
      <NotificationsSection
        memory={Boolean(memory?.service)}
        userId={user.id}
      />
      <Sessions
        currentToken={current?.session.token ?? ""}
        sessions={all
          .map((s) => ({
            device: deviceOf(s.userAgent),
            ip: shownIp(s.ipAddress),
            token: s.token,
            updatedAt: new Date(s.updatedAt).toISOString(),
          }))
          // The latest active first (an ISO string sorts as time; sort works on this fresh copy).
          // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
      />
      <Section title={t("exportTitle")}>
        <DataForm />
      </Section>
      <Section title={t("deleteTitle")}>
        <DangerForm email={user.email} />
      </Section>
    </SettingsPageFrame>
  );
};

export default AccountPage;
