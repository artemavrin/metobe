"use client";

import type { SearchCheck } from "@metobe/core/web-settings";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { RefreshCw } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";

import { EditRow } from "@/components/settings/edit-row";
import { Row, Rows, Section } from "@/components/settings/rows";

import { recheck, saveAddress, toggleTool } from "./actions";

// The web search (ARCH §8.1): which web tools the model gets, and the SearXNG it searches with — its address and
// whether it answers.

interface Settings {
  check: SearchCheck | null;
  defaultUrl: string | null;
  fetchOn: boolean;
  searchOn: boolean;
  url: string | null;
}

type T = ReturnType<typeof useTranslations<"webSearch">>;

const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
  spellCheck: false,
} as const;

const checkLabel = (check: SearchCheck | null, busy: boolean, t: T) => {
  if (busy) {
    return t("check.running");
  }
  if (!check) {
    return t("check.never");
  }
  if (check.ok) {
    return check.found > 0
      ? t("check.ok", { found: check.found, ms: check.ms })
      : t("check.empty", { ms: check.ms });
  }
  return t(`check.${check.reason}`, { detail: check.detail });
};

const checkDot = (check: SearchCheck | null, busy: boolean) => {
  if (busy) {
    return "bg-warning animate-pulse";
  }
  if (!check) {
    return "bg-muted-foreground/40";
  }
  if (!check.ok) {
    return "bg-destructive";
  }
  return check.found > 0 ? "bg-success" : "bg-warning";
};

/** Whether SearXNG answered the last check, and when it was. */
const CheckState = ({
  check,
  busy,
  t,
}: {
  check: SearchCheck | null;
  busy: boolean;
  t: T;
}) => {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const at = check && !busy ? new Date(check.checkedAt) : null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={cn("size-2 shrink-0 rounded-full", checkDot(check, busy))}
      />
      <span className="min-w-0 truncate" title={checkLabel(check, busy, t)}>
        {checkLabel(check, busy, t)}
      </span>
      {at && (
        <span className="text-muted-foreground shrink-0 text-xs">
          {format.relativeTime(at > now ? now : at, now)}
        </span>
      )}
    </span>
  );
};

export const SearchSettings = ({ settings }: { settings: Settings }) => {
  const t = useTranslations("webSearch");
  const [, startChange] = useTransition();
  const [checking, startCheck] = useTransition();
  const [draft, setDraft] = useState(settings.url ?? "");
  const [tools, setOptimisticTools] = useOptimistic(
    { web_fetch: settings.fetchOn, web_search: settings.searchOn },
    (current, change: { tool: "web_search" | "web_fetch"; on: boolean }) => ({
      ...current,
      [change.tool]: change.on,
    })
  );
  const address = settings.url ?? settings.defaultUrl;
  const toggle = (tool: "web_search" | "web_fetch") => (on: boolean) =>
    startChange(async () => {
      setOptimisticTools({ on, tool });
      await toggleTool(tool, on);
    });

  return (
    <>
      <Section title={t("tools")}>
        <Rows>
          <Row
            hint={address ? t("search.hint") : t("search.noAddress")}
            label={t("search.label")}
          >
            <Switch
              aria-label={t("search.label")}
              checked={Boolean(address) && tools.web_search}
              disabled={!address}
              onCheckedChange={toggle("web_search")}
            />
          </Row>
          <Row hint={t("fetch.hint")} label={t("fetch.label")}>
            <Switch
              aria-label={t("fetch.label")}
              checked={tools.web_fetch}
              onCheckedChange={toggle("web_fetch")}
            />
          </Row>
        </Rows>
      </Section>

      <Section
        action={
          address && (
            <Button
              disabled={checking}
              onClick={() => startCheck(() => recheck())}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={cn(checking && "animate-spin")} />
              {t("recheck")}
            </Button>
          )
        }
        title="SearXNG"
      >
        <Rows>
          <EditRow
            editor={
              <Input
                {...NO_AUTOFILL}
                aria-label={t("address.label")}
                autoFocus
                className="font-mono"
                onChange={(e) => setDraft(e.target.value)}
                placeholder={settings.defaultUrl ?? "http://searxng:8080"}
                value={draft}
              />
            }
            // «Empty — the install's address» only when there is another one to go back from.
            hint={
              settings.url && settings.defaultUrl
                ? t("address.hint", { url: settings.defaultUrl })
                : t("address.hintNoDefault")
            }
            label={t("address.label")}
            onSave={async () => {
              const result = await saveAddress(draft);
              return result.ok ? null : t("address.invalid");
            }}
            value={
              address ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-sm">{address}</span>
                  {!settings.url && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t("address.default")}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("address.none")}
                </span>
              )
            }
          />
          {address && (
            <Row hint={t("check.hint")} label={t("check.label")}>
              <CheckState busy={checking} check={settings.check} t={t} />
            </Row>
          )}
        </Rows>
      </Section>
    </>
  );
};
