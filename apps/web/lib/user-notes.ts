/**
 * What the model is told about the user: their own notes from «Персонализация», in their words. They come first —
 * they change rarely, so the start of every prompt stays the same and the cache keeps hitting — and are the user's
 * preferences, not rules of the system: the model follows them where they do not cross safety or the task.
 */
export const aboutUser = (notes: string) => {
  const text = notes.trim();
  return text
    ? `The user's own notes about themselves and how they want answers, from their settings — their words, follow them where they do not cross the task or safety:\n${text}`
    : undefined;
};

/** The instructions of a request: the user's notes, then the services connected in this chat. */
export const withNotes = (notes: string, services?: string) =>
  [aboutUser(notes), services].filter(Boolean).join("\n\n") || undefined;
