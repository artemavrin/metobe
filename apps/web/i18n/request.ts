import { loadMessages } from "@metobe/i18n/messages";
import { getRequestConfig } from "next-intl/server";

import { getPrefs } from "@/lib/prefs";

// The only default export next-intl expects here. The language and zone come from cookies, not the URL (D31).
export default getRequestConfig(async () => {
  const prefs = await getPrefs();
  return {
    locale: prefs.locale,
    messages: await loadMessages(prefs.locale),
    timeZone: prefs.timeZone,
  };
});
