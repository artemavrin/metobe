"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metobe/ui/components/collapsible";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@metobe/ui/components/marker";
import { cn } from "@metobe/ui/lib/utils";
import { GridLoader } from "gridora";
import { ChevronRight, FileText, Globe } from "lucide-react";
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

const Loader = () => (
  <GridLoader cellSize={3} gap={1.5} respectReducedMotion variant="cacheWarm" />
);

const PANEL =
  "h-(--collapsible-panel-height) w-full overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none";

/** A page read: «Читает страницу · site» — the grid while it reads — then the page's title as a link. */
const FetchStep = ({
  part,
}: {
  part: Extract<WebPart, { type: "tool-web_fetch" }>;
}) => {
  const t = useTranslations("chat.web");
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const url = part.input?.url ?? "";
  const done = part.state === "output-available" ? part.output : null;
  let label = t("reading");
  if (done) {
    label = t("read");
  } else if (part.state === "output-error") {
    label = t("readFailed");
  }
  return (
    <Marker className="w-fit max-w-full gap-2">
      <MarkerIcon className="grid size-3.5 place-items-center [&_svg]:size-3.5">
        {running ? <Loader /> : <FileText />}
      </MarkerIcon>
      <MarkerContent className={cn("min-w-0 truncate", running && "shimmer")}>
        {label}
        {url && (
          <>
            {" · "}
            <a
              className="hover:text-foreground underline-offset-2 hover:underline"
              href={done?.url ?? url}
              rel="noreferrer"
              target="_blank"
              title={done?.url ?? url}
            >
              {done?.title ?? siteOf(url)}
            </a>
          </>
        )}
      </MarkerContent>
    </Marker>
  );
};

/** A search: «Ищет в интернете · «query»» — the grid while it looks — then how many it found, unfolding into the links. */
const SearchWebStep = ({
  part,
}: {
  part: Extract<WebPart, { type: "tool-web_search" }>;
}) => {
  const t = useTranslations("chat.web");
  const [open, setOpen] = useState(false);
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const found = part.state === "output-available" ? part.output.results : [];
  let label = t("searching");
  if (part.state === "output-available") {
    label = t("found", { count: found.length });
  } else if (part.state === "output-error") {
    label = `${t("searching")} · ${t("failed")}`;
  }
  const query = part.input?.query;
  return (
    <Collapsible
      className="flex flex-col items-start"
      onOpenChange={setOpen}
      open={open}
    >
      <Marker
        className="enabled:hover:text-foreground w-fit gap-2 transition-colors duration-150 disabled:cursor-default"
        render={<CollapsibleTrigger disabled={found.length === 0} />}
      >
        <MarkerIcon className="grid size-3.5 place-items-center [&_svg]:size-3.5">
          {running ? <Loader /> : <Globe />}
        </MarkerIcon>
        <MarkerContent className={cn(running && "shimmer")}>
          {label}
          {query && <span> · {t("query", { query })}</span>}
        </MarkerContent>
        {found.length > 0 && (
          <MarkerIcon className="-ml-1">
            <ChevronRight
              className={cn(
                "size-3.5 transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                open && "rotate-90"
              )}
            />
          </MarkerIcon>
        )}
      </Marker>
      <CollapsibleContent className={PANEL}>
        <ul className="border-border mt-2 flex flex-col gap-1.5 border-l pl-3 text-xs">
          {found.map((result) => (
            <li className="flex min-w-0 items-baseline gap-2" key={result.url}>
              <a
                className="text-foreground truncate underline-offset-2 hover:underline"
                href={result.url}
                rel="noreferrer"
                target="_blank"
                title={result.snippet || result.title}
              >
                {result.title}
              </a>
              <span className="text-muted-foreground shrink-0">
                {siteOf(result.url)}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

/** A step of the web in the answer's work: a search or a page read, as a server's tool calls are. */
export const WebStep = ({ part }: { part: WebPart }) =>
  part.type === "tool-web_fetch" ? (
    <FetchStep part={part} />
  ) : (
    <SearchWebStep part={part} />
  );

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
