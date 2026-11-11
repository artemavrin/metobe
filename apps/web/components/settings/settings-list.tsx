"use client";

import { SidebarInput, useSidebar } from "@metobe/ui/components/sidebar";
import { Mail, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Fragment, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { ProxyMark } from "@/components/proxy-mark";
import {
  KindTile,
  ListHeader,
  ListHeading,
  ListLabel,
  ListRow,
  useListHighlight,
} from "@/components/sidebar-list";
import type { SettingsList } from "@/lib/settings-lists";

// The list level of the settings sidebar (P7 «Погружение»): the section's entries, with the selected row's background
// sliding to the new row — the detail came from here.

/** Lists longer than this get a search. */
const SEARCH_FROM = 6;

type Entry = SettingsList["entries"][number];

/** One row: its picture, its title, where it stands. */
const EntryRow = ({
  entry,
  active,
  onPick,
}: {
  entry: Entry;
  active: boolean;
  onPick: () => void;
}) => {
  let leading = <BrandLogo label={entry.title} logo={entry.logo} size={28} />;
  if (entry.icon === "mail") {
    leading = (
      <KindTile>
        <Mail />
      </KindTile>
    );
  } else if (entry.mark) {
    leading = <ProxyMark flag={entry.mark.flag} size={28} />;
  }
  return (
    <ListRow
      active={active}
      count={entry.count}
      entryKey={entry.id}
      href={entry.href}
      leading={leading}
      onClick={onPick}
      state={entry.state}
      sub={entry.sub}
      title={entry.title}
      warn={entry.state === "error"}
    />
  );
};

/**
 * A group of the user's own connections of one kind: its heading with its own «+», its entries — or, while it has
 * none, one row that adds the first.
 */
const Section = ({
  section,
  activeId,
  query,
  onPick,
}: {
  section: NonNullable<SettingsList["sections"]>[number];
  activeId: string | undefined;
  query: string;
  onPick: () => void;
}) => {
  const entries = query
    ? section.entries.filter((e) => e.title.toLowerCase().includes(query))
    : section.entries;
  if (query && entries.length === 0) {
    return null;
  }
  return (
    <>
      <ListHeading
        add={{ ...section.add, onClick: onPick }}
        title={section.title}
      />
      {entries.map((e) => (
        <EntryRow
          active={e.id === activeId}
          entry={e}
          key={e.id}
          onPick={onPick}
        />
      ))}
      {entries.length === 0 && (
        <Link
          className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-[background-color,color] duration-150"
          href={section.add.href}
          onClick={onPick}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-dashed [&_svg]:size-3.5">
            <Plus />
          </span>
          {section.empty}
        </Link>
      )}
    </>
  );
};

export const SettingsListLevel = ({
  list,
  activeId,
  onBack,
}: {
  list: SettingsList;
  activeId: string | undefined;
  onBack: () => void;
}) => {
  const t = useTranslations("settings");
  const { isMobile, setOpenMobile } = useSidebar();
  // Long lists (providers, proxies) get a search; it resets with the section, since the level remounts.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const entries = q
    ? list.entries.filter((e) => e.title.toLowerCase().includes(q))
    : list.entries;
  const { highlight, ref } = useListHighlight(activeId);
  const close = () => isMobile && setOpenMobile(false);
  return (
    <>
      <ListHeader
        add={list.add && { ...list.add, onClick: close }}
        back={{ label: t("title"), onClick: onBack }}
        meta={list.meta}
        title={list.title}
      >
        {list.entries.length > SEARCH_FROM && (
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <SidebarInput
              aria-label={t("listSearch")}
              autoComplete="off"
              className="pl-8"
              data-1p-ignore
              data-lpignore="true"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("listSearch")}
              value={query}
            />
          </div>
        )}
      </ListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        <nav className="relative flex flex-col gap-0.5 px-2 pb-3" ref={ref}>
          {highlight}
          {entries.length === 0 && !list.sections?.length && (
            <p className="text-muted-foreground px-2.5 py-2 text-sm">
              {t("nothing")}
            </p>
          )}
          {entries.map((e, i) => {
            const active = e.id === activeId;
            // A group's heading goes before its first entry.
            const heading =
              e.group && e.group !== entries[i - 1]?.group ? e.group : null;
            return (
              <Fragment key={e.id}>
                {heading && <ListLabel title={heading} />}
                <EntryRow active={active} entry={e} onPick={close} />
              </Fragment>
            );
          })}
          {list.sections?.map((section) => (
            <Section
              activeId={activeId}
              key={section.title}
              onPick={close}
              query={q}
              section={section}
            />
          ))}
        </nav>
      </div>
    </>
  );
};
