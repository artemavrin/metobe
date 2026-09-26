/** The model a chat opens with: the first preferred id that is still in chat, else the newest model in chat. */
export const pickModel = <T extends { id: string }>(
  models: T[],
  preferred: (string | null | undefined)[]
) =>
  preferred
    .map((id) => models.find((m) => m.id === id))
    .find((m) => m !== undefined) ?? models[0];
