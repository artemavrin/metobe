import type { ToolSet } from "ai";

type Tool = ToolSet[string];

// A change to an MCP server (a check, a new connection, the admin's edit) drops the cached clients of that server and
// closes them — those of chats in the middle of an answer too. The tools such a chat already holds belong to a closed
// client and answer «Attempted to send a request from a closed client» to every call that follows.

/**
 * A request that never left because its client was closed. Only this one is safe to repeat on a new client:
 * «Connection closed» comes when a request already sent loses its answer, and sending it again could do a thing twice.
 */
export const isClosedClient = (error: unknown) =>
  error instanceof Error && /request from a closed client/u.test(error.message);

/**
 * The tool, with a way out of a closed client: its call is made again with the same tool of a fresh client, which
 * `reopen` brings (the server's tools by name). A tool without `execute` (it asks the user, not the server) stays.
 */
export const reopening = (
  tool: Tool,
  name: string,
  reopen: () => Promise<Record<string, Tool>>
): Tool => {
  const { execute } = tool;
  if (!execute) {
    return tool;
  }
  return {
    ...tool,
    execute: async (input, options) => {
      try {
        return await execute(input, options);
      } catch (error) {
        if (!isClosedClient(error)) {
          throw error;
        }
        const fresh = await reopen();
        const again = fresh[name]?.execute;
        if (!again) {
          throw error;
        }
        return again(input, options);
      }
    },
  } as Tool;
};
