import { getLastModelIds } from "@metobe/core/chat";
import { listChatServers } from "@metobe/core/mcp";
import { skillsForChat } from "@metobe/core/skills";

import { ChatView } from "@/components/chat/chat-view";
import { FreshChat } from "@/components/chat/fresh-chat";
import { getPickerData } from "@/lib/chat-data";
import { pickModel } from "@/lib/chat-model";
import { getSettingsViewer } from "@/lib/settings-access";

// «Что поручить?» (ARCH §16.1, P11): a new chat whose questions describe a periodic task. The model drafts it into a
// card, asks for what is missing, and the person creates it there; the chat becomes the task's own.
export const NewTask = async ({ home }: { home: string }) => {
  const { user } = await getSettingsViewer();
  if (!user) {
    return null;
  }
  const [picker, last, servers, skills] = await Promise.all([
    getPickerData(user.id),
    getLastModelIds(user.id),
    listChatServers(user.id),
    skillsForChat(user.id),
  ]);
  const model = pickModel(picker.models, [...last, picker.favorites[0]]);
  if (!model) {
    return null;
  }
  return (
    <FreshChat home={home}>
      <ChatView
        favorites={picker.favorites}
        initialMessages={[]}
        intro
        labels={[]}
        model={model}
        models={picker.models}
        recent={picker.recent}
        servers={servers}
        skills={skills.map((s) => ({
          description: s.description,
          id: s.id,
          name: s.name,
          shared: s.ownerId === null,
        }))}
        task={{ created: null, intent: true }}
      />
    </FreshChat>
  );
};
