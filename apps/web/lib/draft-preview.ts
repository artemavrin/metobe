import type { ModelLabel } from "@metobe/contracts/chat";

// The composer's preview of what the model would get (P31 «Ввод · над текстом», PII-GUARD-PLAN З7).

/** What `POST /api/chat/[id]/preview` answers. */
export type DraftPreview =
  | { state: "off" }
  | { state: "local" }
  | { state: "down" }
  | { state: "blocked" }
  | { state: "masked"; text: string; labels: ModelLabel[] };

export const fetchDraftPreview = async (
  chatId: string,
  modelId: string,
  text: string,
  signal: AbortSignal
): Promise<DraftPreview | null> => {
  const response = await fetch(`/api/chat/${chatId}/preview`, {
    body: JSON.stringify({ modelId, text }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
  return response.ok ? ((await response.json()) as DraftPreview) : null;
};
