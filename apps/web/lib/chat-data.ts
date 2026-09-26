import "server-only";
import { listChatModelLabels } from "@metobe/core/chat";
import {
  getFavoriteModelIds,
  getFirstTokenMedians,
  getRecentModelIds,
  listModelChoices,
} from "@metobe/core/model-choices";
import { cache } from "react";

import { toPickerModel } from "@/lib/model-choice";

/** Models in chat, read once per request: the layout's gate and the page's composer share it. */
export const getChatModels = cache(() => listChatModelLabels());

/** What the model picker needs for this user: models in chat with our own timings, favorites, recent models. */
export const getPickerData = cache(async (userId: string) => {
  const [rows, medians, favorites, recent] = await Promise.all([
    listModelChoices(),
    getFirstTokenMedians(),
    getFavoriteModelIds(userId),
    getRecentModelIds(userId),
  ]);
  return {
    favorites,
    models: rows.map((row) => toPickerModel(row, medians.get(row.id) ?? null)),
    recent,
  };
});
