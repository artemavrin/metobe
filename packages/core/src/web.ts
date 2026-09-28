import "server-only";
import type {
  WebFetchOutput,
  WebResult,
  WebSearchOutput,
} from "@metobe/contracts/web";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";

import { fetchFor, fetchThrough } from "./net";
import { searxngUrl } from "./web-settings";
import type { SearchCheck } from "./web-settings";

// The built-in web tools' backends (ARCH §8.1, D21): SearXNG for search, our own fetch and Defuddle for pages. The
// engines behind SearXNG ban an IP that asks too often (spike S8), so answers are cached and at most two searches
// run at a time. Pages go through the SSRF-guarded transport: the address is checked on every connection,
// redirects included.

/** The latest few hundred answers, each good for a while; the oldest go first. */
const recent = <T>(size: number, ttlMs: number) => {
  const entries = new Map<string, { at: number; value: T }>();
  return {
    get: (key: string) => {
      const hit = entries.get(key);
      if (!hit || Date.now() - hit.at > ttlMs) {
        entries.delete(key);
        return;
      }
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    },
    set: (key: string, value: T) => {
      entries.set(key, { at: Date.now(), value });
      const oldest = entries.keys().next();
      if (entries.size > size && !oldest.done) {
        entries.delete(oldest.value);
      }
    },
  };
};

const searches = recent<WebSearchOutput>(500, 60 * 60 * 1000);
const pages = recent<WebFetchOutput>(200, 24 * 60 * 60 * 1000);

/** At most `limit` at once; the rest wait their turn. */
const gate = (limit: number) => {
  let busy = 0;
  const waiting: (() => void)[] = [];
  return async <T>(run: () => Promise<T>) => {
    if (busy >= limit) {
      // oxlint-disable-next-line promise/avoid-new -- a turn in the queue is a promise the one before resolves
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }
    busy += 1;
    try {
      return await run();
    } finally {
      busy -= 1;
      waiting.shift()?.();
    }
  };
};
const searching = gate(2);

interface SearxResponse {
  results?: {
    title?: string;
    url?: string;
    content?: string;
    publishedDate?: string | null;
  }[];
  unresponsive_engines?: [string, string][];
}

/** A result's address without what does not change the page: the same page found twice counts once. */
const samePage = (url: string) => {
  try {
    const u = new URL(url);
    const kept = new URLSearchParams();
    for (const [key, value] of u.searchParams) {
      if (!key.startsWith("utm_")) {
        kept.append(key, value);
      }
    }
    u.search = kept.toString();
    return `${u.hostname.replace(/^www\./u, "")}${u.pathname.replace(/\/+$/u, "")}${u.search}`;
  } catch {
    return url;
  }
};

/**
 * Why a request failed, as words: fetch throws a bare «fetch failed» with the reason in its cause — and a TypeError
 * from a tool breaks the whole answer instead of reaching the model, so the tools throw plain errors.
 */
const reasonOf = (error: unknown) => {
  const { cause } = error as { cause?: unknown };
  const text = String(
    cause instanceof Error ? cause.message : (cause ?? (error as Error).message)
  );
  return /blocked address/u.test(text)
    ? "it is a private network address, and those are never opened"
    : text;
};

/** A query to SearXNG, as JSON. It is ours — straight to it, whatever the proxy routes say. */
const askSearxng = async (base: string, query: string, language?: string) => {
  const fetchIt = await fetchThrough(null);
  return fetchIt(
    `${base}/search?${new URLSearchParams({ format: "json", language: language ?? "all", q: query, safesearch: "0" })}`,
    // Its bot check wants to know who asks; it is us, from inside.
    {
      headers: { "x-real-ip": "127.0.0.1" },
      signal: AbortSignal.timeout(12_000),
    }
  );
};

/** Up to `limit` results for a query: titles, links and snippets, the same page once. */
export const searchWeb = async (
  { query, language }: { query: string; language?: string },
  limit = 8
): Promise<WebSearchOutput> => {
  const base = await searxngUrl();
  if (!base) {
    throw new Error("web search is not configured");
  }
  const key = `${language ?? "all"}|${query.trim().toLowerCase()}`;
  const hit = searches.get(key);
  if (hit) {
    return hit;
  }
  const data = await searching(async () => {
    let res: Response;
    try {
      res = await askSearxng(base, query, language);
    } catch (error) {
      throw new Error(`web search is unreachable: ${reasonOf(error)}`, {
        cause: error,
      });
    }
    if (!res.ok) {
      throw new Error(`SearXNG answered ${res.status}`);
    }
    return (await res.json()) as SearxResponse;
  });
  const seen = new Set<string>();
  const results: WebResult[] = [];
  for (const r of data.results ?? []) {
    const id = r.url && samePage(r.url);
    if (r.url && r.title && id && !seen.has(id)) {
      seen.add(id);
      results.push({
        ...(r.publishedDate ? { published: r.publishedDate } : {}),
        snippet: (r.content ?? "").trim().slice(0, 300),
        title: r.title.trim(),
        url: r.url,
      });
    }
    if (results.length >= limit) {
      break;
    }
  }
  if (results.length === 0) {
    // Not cached: the engines may answer in a minute.
    return {
      note: data.unresponsive_engines?.length
        ? "The search engines did not answer just now (refused or timed out). Try again in a few minutes, or tell the user."
        : "Nothing was found. Try other words.",
      results,
    };
  }
  const out = { results };
  searches.set(key, out);
  return out;
};

/**
 * Whether a SearXNG answers searches: one query past the cache, timed. A 403 is SearXNG with JSON turned off in its
 * settings.yml — the one mistake worth naming.
 */
export const checkSearxng = async (base: string): Promise<SearchCheck> => {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  let res: Response;
  try {
    res = await askSearxng(base.replace(/\/+$/u, ""), "weather");
  } catch (error) {
    return {
      checkedAt,
      detail: reasonOf(error),
      ok: false,
      reason: "unreachable",
    };
  }
  if (res.status === 403) {
    return { checkedAt, detail: "403", ok: false, reason: "json-off" };
  }
  if (!res.ok) {
    return {
      checkedAt,
      detail: String(res.status),
      ok: false,
      reason: "status",
    };
  }
  const data = (await res.json().catch(() => null)) as SearxResponse | null;
  if (!data) {
    return { checkedAt, detail: "not JSON", ok: false, reason: "status" };
  }
  return {
    checkedAt,
    found: data.results?.length ?? 0,
    ms: Date.now() - started,
    ok: true,
  };
};

/** A browser's own words, so sites that turn away bots still show the page. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const MAX_BYTES = 3 * 1024 * 1024;
// A page is read into a small model's context too (8k tokens on a local qwen3-8b): about 2.5k tokens of text.
const MAX_CHARS = 8000;

/** The body, at most MAX_BYTES of it, in the page's own charset (windows-1251 pages are common here). */
const readText = async (res: Response, type: string) => {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  if (reader) {
    while (size < MAX_BYTES) {
      // oxlint-disable-next-line no-await-in-loop -- a stream is read in order
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
    // The rest is not needed: let the connection go.
    try {
      await reader.cancel();
    } catch {
      // Already closed — nothing to let go of.
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk.subarray(0, Math.min(chunk.byteLength, size - at)), at);
    at += chunk.byteLength;
  }
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset =
    /charset=["']?(?<name>[\w-]+)/iu.exec(type)?.groups?.name ??
    /<meta[^>]+charset=["']?(?<name>[\w-]+)/iu.exec(head)?.groups?.name ??
    "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
};

const cut = (page: Omit<WebFetchOutput, "truncated">): WebFetchOutput => ({
  ...page,
  content: page.content.slice(0, MAX_CHARS),
  truncated: page.content.length > MAX_CHARS,
});

/** Less than this is not a page's text — Defuddle cut away too much. */
const TOO_SHORT = 50;

/**
 * A page's main text as Markdown. Defuddle first; when its list of clutter takes the content itself away (a
 * `.content` wrapper on nalog.gov.ru), again without that list; failing that, the page's plain text.
 */
const mainText = async (html: string, url: string) => {
  const parse = (options: { removeExactSelectors?: boolean } = {}) =>
    Defuddle(parseHTML(html).document, url, {
      markdown: true,
      useAsync: false,
      ...options,
    });
  let page = await parse();
  if (page.content.trim().length < TOO_SHORT) {
    page = await parse({ removeExactSelectors: false });
  }
  let { content } = page;
  if (content.trim().length < TOO_SHORT) {
    const { document } = parseHTML(html);
    for (const el of document.querySelectorAll("script, style, noscript")) {
      el.remove();
    }
    content = (document.body?.textContent ?? "")
      .replaceAll(/\s+/gu, " ")
      .trim();
  }
  return {
    content,
    ...(page.published ? { published: page.published } : {}),
    ...(page.site ? { site: page.site } : {}),
    title: page.title,
  };
};

/** A page's main text as Markdown, with its title, site and date — for the model to read. */
export const fetchPage = async (url: string): Promise<WebFetchOutput> => {
  const target = new URL(url);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("only http and https pages can be read");
  }
  const hit = pages.get(target.href);
  if (hit) {
    return hit;
  }
  const fetchIt = await fetchFor(null, target, { pinned: true });
  let res: Response;
  try {
    res = await fetchIt(target, {
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error(`could not open the page: ${reasonOf(error)}`, {
      cause: error,
    });
  }
  if (!res.ok) {
    throw new Error(`the page answered ${res.status}`);
  }
  const type = res.headers.get("content-type") ?? "";
  const final = res.url || target.href;
  const host = new URL(final).hostname;
  let out: WebFetchOutput;
  if (/html|xml/iu.test(type)) {
    const page = await mainText(await readText(res, type), final);
    out = cut({
      ...page,
      title: page.title || host,
      url: final,
    });
  } else if (/^text\/|json/iu.test(type)) {
    out = cut({
      content: await readText(res, type),
      title: new URL(final).pathname.split("/").pop() || host,
      url: final,
    });
  } else {
    throw new Error(`cannot read ${type || "this kind of file"} yet`);
  }
  pages.set(target.href, out);
  return out;
};
