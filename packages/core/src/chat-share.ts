import type { ChatMessage } from "@metobe/contracts/chat";
import { fileIdOf, fileUrl } from "@metobe/contracts/files";

// Continuing a chat shared with you (D-chat-share): your copy gets new message ids and its own copies of the files,
// so the file parts must point at them. Pure, so it is tested without a database.

/** The messages with every file part of ours pointed at the copied file; a file not copied keeps its link. */
export const withCopiedFiles = (
  list: ChatMessage[],
  copied: ReadonlyMap<string, string>
): ChatMessage[] =>
  list.map((m) => ({
    ...m,
    parts: m.parts.map((p) => {
      if (p.type !== "file") {
        return p;
      }
      const id = fileIdOf(p.url);
      const next = id ? copied.get(id) : undefined;
      return next ? { ...p, url: fileUrl(next) } : p;
    }),
  }));
