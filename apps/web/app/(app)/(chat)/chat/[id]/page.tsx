import {
  getChat,
  getLastModelIds,
  getModelLabels,
  listMessages,
} from "@metobe/core/chat";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ChatView } from "@/components/chat/chat-view";
import { getPickerData } from "@/lib/chat-data";
import { pickModel } from "@/lib/chat-model";
import { getSettingsViewer } from "@/lib/settings-access";

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
  // Someone else's chat is as missing as one that never was.
  if (!user || !chat || chat.userId !== user.id) {
    notFound();
  }
  const [messages, picker] = await Promise.all([
    listMessages(id),
    getPickerData(user.id),
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
      models={models}
      recent={picker.recent}
    />
  );
};

export default ChatPage;
