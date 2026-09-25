import { redirect } from "next/navigation";

import { SETTINGS_NAV } from "@/lib/settings-nav";

// The first screen of settings is the menu's first item — the same for everyone, and it follows the menu's order.
const SettingsIndex = () => {
  const first = SETTINGS_NAV[0]?.items[0]?.id ?? "region";
  redirect(`/settings/${first}`);
};

export default SettingsIndex;
