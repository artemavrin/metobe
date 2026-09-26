import { getLastModelIds } from "@metobe/core/chat";
import { getTranslations } from "next-intl/server";

import { ChatView } from "@/components/chat/chat-view";
import { getPickerData } from "@/lib/chat-data";
import { pickModel } from "@/lib/chat-model";
import { dayPart, hourIn } from "@/lib/greeting";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

// A new chat: the greeting and the composer in the middle. Its id is made here, so the first message creates the
// chat under it and the address becomes /chat/<id> without a reload.
const NewChatPage = async () => {
  const [{ user }, prefs, t] = await Promise.all([
    getSettingsViewer(),
    getPrefs(),
    getTranslations("chat.greeting"),
  ]);
  if (!user) {
    return null;
  }
  const [picker, last] = await Promise.all([
    getPickerData(user.id),
    getLastModelIds(user.id),
  ]);
  const model = pickModel(picker.models, [...last, picker.favorites[0]]);
  // The layout shows «not ready» when chat has no model; a page without one never renders.
  if (!model) {
    return null;
  }
  const name = user.name.trim().split(/\s+/u)[0] ?? "";
  const greeting = t(dayPart(hourIn(new Date(), prefs.timeZone)), {
    hasName: name ? "yes" : "no",
    name,
  });
  const id = crypto.randomUUID();
  return (
    <ChatView
      greeting={greeting}
      id={id}
      initialMessages={[]}
      key={id}
      favorites={picker.favorites}
      labels={[]}
      model={model}
      models={picker.models}
      recent={picker.recent}
    />
  );
};

export default NewChatPage;
