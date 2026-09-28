import {
  webFetchInputSchema,
  webFetchOutputSchema,
  webSearchInputSchema,
  webSearchOutputSchema,
} from "@metobe/contracts/web";
import type {
  WebFetchInput,
  WebFetchOutput,
  WebSearchInput,
  WebSearchOutput,
} from "@metobe/contracts/web";
import { fetchPage, searchWeb } from "@metobe/core/web";
import { tool } from "ai";
import type { Tool } from "ai";

/** The tools' names — the answer's work draws their parts (`tool-web_search`, `tool-web_fetch`) as steps. */
export const WEB_SEARCH = "web_search";
export const WEB_FETCH = "web_fetch";

/** Searches the web (ARCH §8.1): links and snippets; the pages themselves are read with web_fetch. */
export const webSearchTool: Tool<WebSearchInput, WebSearchOutput> = tool({
  description:
    "Search the web. Use it for anything current, anything you are not sure of, and anything after your knowledge cutoff. Returns titles, links and snippets; when a snippet is not enough, read the page with web_fetch. Search in the language the answer is likely written in. Cite the links you rely on as markdown links.",
  execute: (input) => searchWeb(input),
  inputSchema: webSearchInputSchema,
  outputSchema: webSearchOutputSchema,
});

/** Reads a page: its main text as Markdown, without menus and ads. */
export const webFetchTool: Tool<WebFetchInput, WebFetchOutput> = tool({
  description:
    "Read a web page: returns its main text as Markdown, with the title and date. Use it on links from web_search, or on a link the user gave. Pages behind a login, private network addresses and files other than text cannot be read.",
  execute: ({ url }) => fetchPage(url),
  inputSchema: webFetchInputSchema,
  outputSchema: webFetchOutputSchema,
});
