"use client";

import type { UpdateCheck } from "@metobe/core/updates";
import { Button } from "@metobe/ui/components/button";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { Badge } from "@metobe/ui/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@metobe/ui/components/reui/frame";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  TriangleAlert,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { checkUpdatesNow } from "./actions";

// The version card of «О системе» (D35, prototype «Карточка»): what runs, and when GitHub has something newer — its
// notes (every release past this one, together) and the installer's command. The button that updates by itself comes
// with the updater.

const INSTALL =
  "curl -fsSL https://github.com/artemavrin/metobe/releases/latest/download/install.sh | bash";
const SHOWN = 3;

const NoteList = ({
  title,
  items,
  all,
}: {
  title: string;
  items: string[];
  all: boolean;
}) =>
  items.length === 0 ? null : (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-muted-foreground text-xs font-medium">
        {title} · {items.length}
      </h4>
      <ul className="flex flex-col gap-1.5">
        {(all ? items : items.slice(0, SHOWN)).map((it) => (
          <li className="flex gap-2 text-sm leading-snug" key={it}>
            <span
              aria-hidden
              className="bg-muted-foreground/50 mt-[0.45rem] size-1 shrink-0 rounded-full"
            />
            <span className="first-letter:uppercase">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );

/** What is new and fixed in every release past this one; three of each, the rest on a click. */
const Notes = ({ newer }: { newer: UpdateCheck["newer"] }) => {
  const t = useTranslations("about");
  const [all, setAll] = useState(false);
  const features = newer.flatMap((r) => r.features);
  const fixes = newer.flatMap((r) => r.fixes);
  const hidden =
    Math.max(features.length - SHOWN, 0) + Math.max(fixes.length - SHOWN, 0);
  if (features.length + fixes.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noNotes")}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 @2xl:grid-cols-2">
        <NoteList all={all} items={features} title={t("features")} />
        <NoteList all={all} items={fixes} title={t("fixes")} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {hidden > 0 && (
          <Button
            className="-ml-2"
            onClick={() => setAll(!all)}
            size="sm"
            variant="ghost"
          >
            {all ? t("less") : t("more", { count: hidden })}
            <ChevronDown
              className={cn("transition-transform", all && "rotate-180")}
            />
          </Button>
        )}
        {newer[0] && (
          <a
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            href={newer[0].url}
            rel="noreferrer"
            target="_blank"
          >
            {t("github")}
            <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};

/** The installer's command, a click to copy. */
const Manual = ({ version }: { version: string }) => {
  const t = useTranslations("about");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {t("manual", { version })}
      </p>
      <div className="bg-muted/60 flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          {INSTALL}
        </code>
        <Button
          aria-label={copied ? t("copied") : t("copy")}
          onClick={() => {
            void navigator.clipboard?.writeText(INSTALL);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          size="icon-sm"
          variant="ghost"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
};

const CheckNow = () => {
  const t = useTranslations("about");
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => start(() => checkUpdatesNow())}
      size="sm"
      variant="outline"
    >
      {pending && <Spinner />}
      {t("checkNow")}
    </Button>
  );
};

export const AboutCard = ({
  updates,
  now,
}: {
  updates: UpdateCheck;
  /** The server's moment, so «проверено 5 минут назад» reads the same before and after hydration. */
  now: string;
}) => {
  const t = useTranslations("about");
  const format = useFormatter();
  const [next] = updates.newer;
  const earlier = updates.newer.length - 1;
  let badge = <Badge variant="outline">{t("badge.unknown")}</Badge>;
  if (next) {
    badge = <Badge variant="warning-light">{t("badge.available")}</Badge>;
  } else if (updates.checkedAt && !updates.error) {
    badge = <Badge variant="success-light">{t("badge.latest")}</Badge>;
  }
  return (
    <Frame className="@container">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FrameTitle className="text-base tabular-nums">
            {t("version", { version: updates.current })}
          </FrameTitle>
          {badge}
        </div>
        {updates.checkedAt && (
          <FrameDescription>
            {t("checked", {
              when: format.relativeTime(
                new Date(updates.checkedAt),
                new Date(now)
              ),
            })}
          </FrameDescription>
        )}
      </FrameHeader>
      <FramePanel className="flex flex-col gap-5">
        {updates.error && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription className="flex flex-col items-start gap-2">
              {t("failed", { reason: updates.error })}
              {next && <CheckNow />}
            </AlertDescription>
          </Alert>
        )}
        {next ? (
          <>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold tabular-nums">
                {t("available", { version: next.version })}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t("released", {
                  date: format.dateTime(new Date(`${next.date}T12:00:00Z`), {
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  }),
                })}
                {earlier > 0 && ` · ${t("andEarlier", { count: earlier })}`}
              </p>
            </div>
            <Notes newer={updates.newer} />
            <Manual version={next.version} />
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {updates.checkedAt ? t("latest") : t("never")}
            </p>
            <CheckNow />
          </div>
        )}
      </FramePanel>
    </Frame>
  );
};
