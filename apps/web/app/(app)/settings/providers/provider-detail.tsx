"use client";

import type { ProviderDetail as Detail } from "@metobe/core/providers";
import { Input } from "@metobe/ui/components/input";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { LogoPicker } from "@/components/logo-picker";
import { Section } from "@/components/settings/rows";
import { contextLabel, isNew, priceLabel } from "@/lib/model-format";
import { sourceLogo } from "@/lib/source-logo";

import { rename, setLogo, toggleModel } from "./actions";

// One maker (prototype P7, «Погружение»): its name and logo as the chat shows them, and its models from every
// source, each switched on in the source it comes through.

/** A source whose models cannot be in chat right now: off, or its last check failed. */
const unavailable = (s: Detail["models"][number]["source"]) =>
  !s.enabled || s.health?.state === "error";

export const ProviderDetail = ({ detail }: { detail: Detail }) => {
  const t = useTranslations("providers.detail");
  const { provider, models } = detail;
  const [name, setName] = useState(provider.title);
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
  );
  // The picker shows the newest model that is in chat, else the newest at all.
  const shown = inChat[0] ?? models[0];

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

  return (
    <>
      <header className="grid grid-cols-[auto_1fr] items-center gap-4 md:grid-cols-[auto_1fr_280px]">
        <LogoPicker
          label={provider.title}
          onPick={(logo) => startSave(() => setLogo(provider.id, logo))}
          value={provider.logo ?? undefined}
        />
        <div className="flex min-w-0 flex-col gap-1">
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
            {t("summary", { on: inChat.length, total: models.length })}
            {provider.edited && ` · ${t("renamed")}`}
          </p>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
          <span className="text-muted-foreground text-xs">{t("preview")}</span>
          <span className="bg-muted/40 flex h-9 w-fit max-w-full items-center gap-2 rounded-full border px-2.5 text-sm">
            <BrandLogo
              label={provider.title}
              logo={provider.logo ?? undefined}
              size={18}
            />
            <span className="truncate">{shown?.title ?? provider.title}</span>
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
          </span>
        </div>
      </header>

      <Section meta={t("modelsMeta")} title={t("models")}>
        <ul className="divide-y rounded-lg border">
          {models.map((m) => {
            const off = unavailable(m.source);
            const on = enabled.has(m.id);
            const price = priceLabel(m);
            const context = contextLabel(m.contextWindow);
            return (
              <li key={m.id}>
                {/* The whole row is the switch's label: a click anywhere on it flips the model */}
                <label
                  className={cn(
                    "flex items-center gap-3 px-4 py-2",
                    off ? "cursor-not-allowed" : "cursor-pointer"
                  )}
                  title={off ? t("unavailable") : m.modelId}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={cn(
                        "truncate font-medium transition-colors duration-150",
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
                  </span>
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
                    {context}
                  </span>
                  <span className="text-muted-foreground w-28 truncate text-right text-xs tabular-nums">
                    {price ?? t("noPrice")}
                  </span>
                  <Switch
                    checked={on}
                    disabled={off}
                    onCheckedChange={(next) =>
                      startToggle(async () => {
                        setOptimistic({ id: m.id, on: next });
                        await toggleModel(m.source.id, m.id, next);
                      })
                    }
                    size="sm"
                  />
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs">{t("footnote")}</p>
      </Section>
    </>
  );
};
