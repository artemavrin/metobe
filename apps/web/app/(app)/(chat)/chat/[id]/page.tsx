import {
  getChat,
  getLastModelIds,
  getModelLabels,
  getSharedChat,
  listMessages,
  listVotes,
} from "@metobe/core/chat";
import { listChatServers } from "@metobe/core/mcp";
import { skillsForChat } from "@metobe/core/skills";
import { getTaskByChat } from "@metobe/core/tasks";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ChatView } from "@/components/chat/chat-view";
import { SharedChat } from "@/components/chat/shared-chat";
import { getPickerData } from "@/lib/chat-data";
import { pickModel } from "@/lib/chat-model";
import { getSettingsViewer } from "@/lib/settings-access";

/** A chat shared with the team, as its reader sees it: the thread, who wrote it, «continue in your own copy». */
const sharedPage = async (id: string) => {
  const shared = await getSharedChat(id);
  if (!shared) {
    notFound();
  }
  const [messages, servers] = await Promise.all([
    listMessages(id),
    // The owner's servers name the tools in the work — their pictures and titles, never their credentials.
    listChatServers(shared.owner.id),
  ]);
  const labels = await getModelLabels([
    ...new Set(
      messages.flatMap((m) => (m.metadata?.modelId ? [m.metadata.modelId] : []))
    ),
  ]);
  return (
    <SharedChat
      id={id}
      key={id}
      labels={labels}
      messages={messages}
      owner={shared.owner.name || shared.owner.email}
      servers={servers}
      title={shared.chat.title}
    />
  );
};

// An existing chat: its history from the database, the composer below. A chat keeps its model — the one that
// answered last — while that model is still in chat.
const ChatPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }
  const [{ user }, chat] = await Promise.all([
    getSettingsViewer(),
    getChat(id),
  ]);
  if (!user || !chat) {
    notFound();
  }
  // Someone else's chat is as missing as one that never was — unless its owner shared it with the team: then it reads.
  if (chat.userId !== user.id) {
    return await sharedPage(id);
  }
  const [messages, picker, servers, votes, skills, task] = await Promise.all([
    listMessages(id),
    getPickerData(user.id),
    listChatServers(user.id),
    listVotes(id),
    skillsForChat(user.id),
    getTaskByChat(user.id, id),
  ]);
  const { models } = picker;
  const answeredBy = messages.flatMap((m) =>
    m.metadata?.modelId ? [m.metadata.modelId] : []
  );
  const model = pickModel(models, [
    answeredBy.at(-1),
    ...(await getLastModelIds(user.id, id)),
    picker.favorites[0],
  ]);
  if (!model) {
    return null;
  }
  // Answers by models that have left the chat still show who wrote them.
  const gone = [...new Set(answeredBy)].filter(
    (modelId) => !models.some((m) => m.id === modelId)
  );
  const labels = await getModelLabels(gone);
  return (
    <ChatView
      id={id}
      initialMessages={messages}
      key={id}
      favorites={picker.favorites}
      labels={labels}
      model={model}
      task={{ created: task }}
      models={models}
      recent={picker.recent}
      servers={servers}
      skills={skills.map((s) => ({
        description: s.description,
        id: s.id,
        name: s.name,
        shared: s.ownerId === null,
      }))}
      votes={votes}
    />
  );
};

export default ChatPage;
