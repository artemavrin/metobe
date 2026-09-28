import type { ServerTools } from "@metobe/core/mcp";
import { toolSearch } from "ai";
import type { ToolSet } from "ai";

// A big MCP server lends its tools on demand (AI SDK's tool search): a hundred tool schemas would take tens of
// thousands of tokens from every question, most of them never used. The model sees one tool to find them with; what
// it finds — up to five a search — is loaded for its next step.

/** The tool the model finds a big server's tools with; its call shows in the work as a search. */
export const FIND_TOOLS = "find_tools";

/** A server with more tools than this lends them on demand. */
export const ON_DEMAND_AFTER = 12;

/** A lent server with at most this many tools has their names listed in the search's description. */
export const NAMES_LISTED_UP_TO = 40;

/** Words of tool names that say what a tool does, not what it is about. */
const GENERIC = new Set([
  "a",
  "add",
  "all",
  "and",
  "at",
  "by",
  "change",
  "check",
  "copy",
  "create",
  "delete",
  "edit",
  "find",
  "for",
  "from",
  "get",
  "in",
  "into",
  "list",
  "make",
  "move",
  "new",
  "of",
  "on",
  "or",
  "remove",
  "rename",
  "search",
  "send",
  "set",
  "the",
  "to",
  "update",
  "with",
]);

/** A tool name's words, the way the search reads them: `createDeal` and `create_deal` both give «create», «deal». */
const wordsOf = (name: string) =>
  name
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

/** What a server's tools are about: the words their names use most, so the model searches with the right ones. */
export const topicsOf = (names: string[], limit = 12) => {
  const counts = new Map<string, number>();
  for (const word of names.flatMap(wordsOf)) {
    if (!GENERIC.has(word) && !/^\d+$/u.test(word)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  // Most used first; a tie keeps the order the words came in.
  return (
    [...counts.entries()]
      // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted is past the ES2022 target
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word]) => word)
  );
};

/**
 * The MCP tools a chat gives the model. A small server's go as they are; a big one's wait for `find_tools` —
 * except the tools this thread has already called, loaded at once for the next question (and an answer carried on
 * after «ask first?» finds its tool in place).
 */
export const lendTools = (servers: ServerTools[], used: Set<string>) => {
  const tools: ToolSet = {};
  const lent: string[] = [];
  for (const server of servers) {
    const names = Object.keys(server.tools);
    const onDemand = names.length > ON_DEMAND_AFTER;
    for (const [name, tool] of Object.entries(server.tools)) {
      tools[name] =
        onDemand && !used.has(name) ? { ...tool, deferLoading: true } : tool;
    }
    if (onDemand) {
      const topics = topicsOf(names.map((n) => n.slice(server.key.length + 1)));
      const about = server.description ? ` (${server.description})` : "";
      // Up to a few dozen, the names themselves: the model searches by them instead of guessing words.
      const listed =
        names.length <= NAMES_LISTED_UP_TO
          ? `: ${names.join(", ")}`
          : `, mostly about ${topics.join(", ")}`;
      lent.push(
        `${server.title}${about} — ${names.length} tools named ${server.key}_…${listed}`
      );
    }
  }
  if (lent.length > 0) {
    // The SDK's own search, told what waits behind it; it is known by a mark the copy keeps.
    const search = toolSearch();
    tools[FIND_TOOLS] = {
      ...search,
      description: `${search.description} Tools of these services are found here: ${lent.join("; ")}.`,
    };
  }
  return tools;
};

/**
 * What the model is told of the chat's MCP servers: each by its tools' prefix, with the admin's word on what it is
 * for — so it knows which service answers what, and that a big one's tools are found with `find_tools`.
 */
export const servicesNote = (servers: ServerTools[]) => {
  if (servers.length === 0) {
    return;
  }
  const lines = servers.map((server) => {
    // Its own sentence: the admin's words without their last dot, ours after them.
    const about = server.description
      ? `: ${server.description.replace(/[\s.]+$/u, "")}`
      : "";
    const found =
      Object.keys(server.tools).length > ON_DEMAND_AFTER
        ? `. Its tools are found with ${FIND_TOOLS}.`
        : "";
    return `- ${server.title} (tools named ${server.key}_…)${about}${found}`;
  });
  return `MCP services connected in this chat:\n${lines.join("\n")}`;
};
