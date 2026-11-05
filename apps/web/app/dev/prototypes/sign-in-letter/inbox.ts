import type { Inbox } from "./prototype";

/** The user's last letters in the dev Mailpit, for the client's list around ours; nothing when it does not run. */
export const inboxOf = async (email: string): Promise<Inbox> => {
  try {
    const r = await fetch(
      `http://127.0.0.1:8025/api/v1/search?limit=6&query=${encodeURIComponent(`to:${email}`)}`,
      { cache: "no-store" }
    );
    const body = (await r.json()) as {
      messages: { Created: string; From: { Name: string; Address: string }; Snippet: string; Subject: string }[];
    };
    return body.messages.map((m) => ({
      at: m.Created,
      from: m.From.Name || m.From.Address,
      snippet: m.Snippet,
      subject: m.Subject,
    }));
  } catch {
    return [];
  }
};
