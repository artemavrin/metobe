"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { WebPart } from "@/lib/answer-work";

// The web in an answer (ARCH §8.1): a search and a page read are steps of the work, as a server's tool calls; the
// pages the answer stands on are listed under it.

/** A link's site as people read it: `nalog.gov.ru`, not the whole address. */
const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

/** How many sources show before «ещё N». */
const SHOWN = 5;

/**
 * What the answer stands on: the pages it read first, then what the searches found — each page once, as its site.
 * Nothing when the answer did not go to the web.
 */
export const WebSources = ({ parts }: { parts: WebPart[] }) => {
  const t = useTranslations("chat.web");
  const [all, setAll] = useState(false);
  const read = parts.flatMap((p) =>
    p.type === "tool-web_fetch" && p.state === "output-available"
      ? [{ title: p.output.title, url: p.output.url }]
      : []
  );
  const found = parts.flatMap((p) =>
    p.type === "tool-web_search" && p.state === "output-available"
      ? p.output.results.map((r) => ({ title: r.title, url: r.url }))
      : []
  );
  const seen = new Set<string>();
  const sources = [...read, ...found].filter((s) => {
    if (seen.has(s.url)) {
      return false;
    }
    seen.add(s.url);
    return true;
  });
  if (sources.length === 0) {
    return null;
  }
  const shown = all ? sources : sources.slice(0, SHOWN);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground mr-1 text-xs">{t("sources")}</span>
      {shown.map((source) => (
        <a
          className="bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-6 max-w-56 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors duration-150"
          href={source.url}
          key={source.url}
          rel="noreferrer"
          target="_blank"
          title={source.title}
        >
          <Globe className="size-3 shrink-0" />
          <span className="truncate">{siteOf(source.url)}</span>
        </a>
      ))}
      {!all && sources.length > SHOWN && (
        <button
          className="text-muted-foreground hover:text-foreground h-6 rounded-full px-2 text-xs transition-colors duration-150"
          onClick={() => setAll(true)}
          type="button"
        >
          {t("more", { count: sources.length - SHOWN })}
        </button>
      )}
    </div>
  );
};
