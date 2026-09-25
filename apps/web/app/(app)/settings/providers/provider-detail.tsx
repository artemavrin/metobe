"use client";

import type { ProviderDetail as Detail } from "@metobe/core/providers";
import type { SourceDetail } from "@metobe/core/sources-read";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useOptimistic, useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { LogoPicker } from "@/components/logo-picker";
import { Section } from "@/components/settings/rows";
import { contextLabel, isNew, priceLabel } from "@/lib/model-format";
import { sourceLogo } from "@/lib/source-logo";

import { ModelDrawer } from "../sources/model-drawer";
import { rename, setLogo, toggleModel } from "./actions";

// One maker (prototype P7, «Погружение»): its name and logo, and its models from every source — found by search,
// narrowed to the ones in chat or to one source, edited in the same drawer as on a source's page, and switched
// on in the source each comes through.

type Row = Detail["models"][number];

/** A source whose models cannot be in chat right now: off, or its last check failed. */
const unavailable = (s: Row["source"]) =>
  !s.enabled || s.health?.state === "error";

export const ProviderDetail = ({ detail }: { detail: Detail }) => {
  const t = useTranslations("providers.detail");
  const ts = useTranslations("sources.detail.models");
  const { provider, models } = detail;
  const [name, setName] = useState(provider.title);
  const [query, setQuery] = useState("");
  const [onlyOn, setOnlyOn] = useState(false);
  const [pickedSources, setPickedSources] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [, startToggle] = useTransition();
  // Switches answer at once; the server's answer replaces the guess.
  const [enabled, setOptimistic] = useOptimistic(
    new Set(models.filter((m) => m.enabled).map((m) => m.id)),
    (current, change: { id: string; on: boolean }) => {
      const next = new Set(current);
      if (change.on) {
        next.add(change.id);
      } else {
        next.delete(change.id);
      }
      return next;
    }
  );
  const inChat = models.filter(
    (m) => enabled.has(m.id) && !unavailable(m.source)
  ).length;

  // The sources this maker comes through, for the source chips.
  const sources = useMemo(() => {
    const byId = new Map<string, { source: Row["source"]; n: number }>();
    for (const m of models) {
      const entry = byId.get(m.source.id) ?? { n: 0, source: m.source };
      entry.n += 1;
      byId.set(m.source.id, entry);
    }
    return [...byId.values()];
  }, [models]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter(
      (m) =>
        (!onlyOn || enabled.has(m.id)) &&
        (pickedSources.size === 0 || pickedSources.has(m.source.id)) &&
        (!q || `${m.title} ${m.modelId}`.toLowerCase().includes(q))
    );
  }, [enabled, models, onlyOn, pickedSources, query]);

  const pickSource = (id: string) =>
    setPickedSources((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const saveName = () => {
    const next = name.trim();
    if (!next) {
      setName(provider.title);
      return;
    }
    if (next !== provider.title) {
      startSave(() => rename(provider.id, next));
    }
  };

  // The drawer takes a source page's model; here the maker is this provider.
  const open = models.find((m) => m.id === editing);
  const drawerModel: SourceDetail["models"][number] | null = open
    ? {
        ...open,
        provider: {
          id: provider.id,
          logo: provider.logo,
          slug: provider.slug,
          title: provider.title,
        },
      }
    : null;

  return (
    <>
      <header className="flex items-center gap-4">
        <LogoPicker
          label={provider.title}
          onPick={(logo) => startSave(() => setLogo(provider.id, logo))}
          value={provider.logo ?? undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Input
            aria-label={t("name")}
            autoComplete="off"
            className="hover:border-input h-8 border-transparent bg-transparent px-1.5 text-xl font-semibold shadow-none md:text-xl dark:bg-transparent"
            data-1p-ignore
            onBlur={saveName}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            value={name}
          />
          <p className="text-muted-foreground px-1.5 text-xs">
            {t("summary", { on: inChat, total: models.length })}
            {detail.renamed && ` · ${t("renamed")}`}
          </p>
        </div>
      </header>

      <Section meta={t("modelsMeta")} title={t("models")}>
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-48 flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              autoComplete="off"
              data-1p-ignore
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ts("search")}
              value={query}
            />
          </InputGroup>
          <Button
            aria-pressed={onlyOn}
            className={cn(
              onlyOn &&
                "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
            )}
            onClick={() => setOnlyOn((v) => !v)}
            variant="outline"
          >
            {ts("inChat")}
          </Button>
        </div>
        {sources.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {sources.map(({ source, n }) => (
              <button
                aria-pressed={pickedSources.has(source.id)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg border pr-2.5 pl-1.5 text-xs transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]",
                  pickedSources.has(source.id)
                    ? "border-foreground/40 bg-muted"
                    : "hover:bg-muted/60 text-muted-foreground"
                )}
                key={source.id}
                onClick={() => pickSource(source.id)}
                type="button"
              >
                <BrandLogo
                  label={source.title}
                  logo={sourceLogo(source)}
                  size={20}
                />
                {source.title}
                <span className="text-muted-foreground tabular-nums">{n}</span>
              </button>
            ))}
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {shown.length === 0 && (
            <li className="text-muted-foreground px-4 py-6 text-center">
              {ts("nothing")}
            </li>
          )}
          {shown.map((m) => {
            const off = unavailable(m.source);
            const on = enabled.has(m.id);
            const price = priceLabel(m);
            return (
              <li className="flex items-center gap-3 px-4 py-2" key={m.id}>
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setEditing(m.id)}
                  title={m.modelId}
                  type="button"
                >
                  <span
                    className={cn(
                      "hover:text-foreground truncate font-medium transition-colors duration-150",
                      (!on || off) && "text-muted-foreground"
                    )}
                  >
                    {m.title}
                  </span>
                  {isNew(m.releasedAt) && (
                    <Badge size="sm" variant="info-light">
                      {t("new")}
                    </Badge>
                  )}
                </button>
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <BrandLogo
                    label={m.source.title}
                    logo={sourceLogo(m.source)}
                    size={16}
                  />
                  <span className="hidden max-w-40 truncate sm:inline">
                    {m.source.title}
                  </span>
                </span>
                {/* Always there, empty when unknown: a missing cell would shift the columns */}
                <span className="text-muted-foreground hidden w-12 text-right text-xs tabular-nums sm:inline">
                  {contextLabel(m.contextWindow)}
                </span>
                <button
                  className="text-muted-foreground hover:text-foreground w-28 truncate text-right text-xs tabular-nums transition-colors duration-150"
                  onClick={() => setEditing(m.id)}
                  type="button"
                >
                  {price ?? t("noPrice")}
                </button>
                <Switch
                  aria-label={m.title}
                  checked={on}
                  disabled={off}
                  onCheckedChange={(next) =>
                    startToggle(async () => {
                      setOptimistic({ id: m.id, on: next });
                      await toggleModel(m.source.id, m.id, next);
                    })
                  }
                  size="sm"
                  title={off ? t("unavailable") : undefined}
                />
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs">{t("footnote")}</p>
      </Section>

      <ModelDrawer
        fromSource={open?.source.kind === "gateway"}
        model={drawerModel}
        onClose={() => setEditing(null)}
        sourceId={open?.source.id ?? ""}
      />
    </>
  );
};
