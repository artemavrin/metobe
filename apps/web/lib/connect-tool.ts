import {
  requestConnectionInputSchema,
  requestConnectionOutputSchema,
} from "@metobe/contracts/chat";
import type {
  RequestConnectionInput,
  RequestConnectionOutput,
} from "@metobe/contracts/chat";
import type { ChatServer } from "@metobe/core/mcp";
import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

/** The tool's name — the answer draws its part (`tool-request_connection`) as «connect X to go on». */
export const REQUEST_CONNECTION = "request_connection";

/**
 * «Connect X to go on» (ARCH §17.7): the services the user may connect with their own account and has not yet. No
 * execute — the answer stops on the call, the chat shows the ask, and the user's answer comes back as its output;
 * then the answer carries on with the service's tools. Offered only when there is something to connect: a per-user
 * server, or mail while the user has no mailbox.
 */
/** The user's own mail: asked for as `email` while they have no mailbox. */
export const MAIL_KEY = "email";

export const requestConnectionTool = (
  waiting: ChatServer[],
  { mail }: { mail: boolean }
): Tool<RequestConnectionInput, RequestConnectionOutput> =>
  tool({
    description: [
      "Ask the user to connect a service this answer needs and that is not connected yet. The chat shows them a sign-in; once they answer, you get whether it is connected, and if it is, its tools. Use it only when the question needs that service's data; say in `reason`, in one short sentence in the user's language, what you need it for. If it stays unconnected, answer without it and say what you could not check.",
      "Services the user can connect:",
      ...waiting.map((s) => {
        const about = s.description
          ? `: ${s.description.replace(/[\s.]+$/u, "")}`
          : "";
        return `- ${s.key} — ${s.title}${about}`;
      }),
      ...(mail
        ? [
            `- ${MAIL_KEY} — the user's own mailbox: send letters, search and read the inbox`,
          ]
        : []),
    ].join("\n"),
    // The keys as an enum: the model sees which values there are.
    inputSchema: requestConnectionInputSchema.extend({
      server: z.enum([
        ...waiting.map((s) => s.key),
        ...(mail ? [MAIL_KEY] : []),
      ] as [string, ...string[]]),
    }),
    outputSchema: requestConnectionOutputSchema,
  });
