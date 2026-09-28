import { z } from "zod";

// The built-in web tools (ARCH §8.1, D21): search through SearXNG, read a page as Markdown. What the model gets
// back is also what the answer's work shows.

export const webSearchInputSchema = z.object({
  language: z
    .string()
    .regex(/^[a-z]{2}$/u)
    .optional()
    .describe(
      "The results' language as a two-letter code (ru, en); omit to let the engines decide."
    ),
  query: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("What to look for, as you would type it into a search engine."),
});
export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export const webResultSchema = z.object({
  published: z.string().optional(),
  snippet: z.string(),
  title: z.string(),
  url: z.string(),
});
export type WebResult = z.infer<typeof webResultSchema>;

export const webSearchOutputSchema = z.object({
  /** Why there is nothing — the engines refused or found nothing — said so the model can tell the user. */
  note: z.string().optional(),
  results: z.array(webResultSchema),
});
export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;

export const webFetchInputSchema = z.object({
  url: z
    .url()
    .describe("The page to read: a link from web_search or one the user gave."),
});
export type WebFetchInput = z.infer<typeof webFetchInputSchema>;

export const webFetchOutputSchema = z.object({
  /** The page's main text as Markdown, cut to a length the model can take. */
  content: z.string(),
  published: z.string().optional(),
  site: z.string().optional(),
  title: z.string(),
  truncated: z.boolean(),
  /** Where the page ended up, after redirects. */
  url: z.string(),
});
export type WebFetchOutput = z.infer<typeof webFetchOutputSchema>;
