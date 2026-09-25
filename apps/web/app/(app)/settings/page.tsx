import { redirect } from "next/navigation";

import { getSettingsViewer } from "@/lib/settings-access";

// The first screen of settings: admins land on sources (no sources — no chat, ARCH §2.2), everyone else on their own.
const SettingsIndex = async () => {
  const { admin } = await getSettingsViewer();
  redirect(admin ? "/settings/sources" : "/settings/appearance");
};

export default SettingsIndex;
