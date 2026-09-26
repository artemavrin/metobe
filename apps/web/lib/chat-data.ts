import "server-only";
import { listChatModelLabels } from "@metobe/core/chat";
import { cache } from "react";

/** Models in chat, read once per request: the layout's gate and the page's composer share it. */
export const getChatModels = cache(() => listChatModelLabels());
