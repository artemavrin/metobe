"use client";

import { modelSlots } from "@metobe/contracts/models";
import type { ModelSlot } from "@metobe/contracts/models";
import { Button } from "@metobe/ui/components/button";
import { ChevronDown, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { PickerDataProvider, fmtContext } from "@/components/chat/picker/data";
import type { PickerModel } from "@/components/chat/picker/data";
import { ModelPalette } from "@/components/chat/picker/palette";
import { useFavorites } from "@/components/chat/picker/use-favorites";
import { Row, Rows, Section } from "@/components/settings/rows";

import { saveSlot } from "./actions";

/** The model of a job at a glance: who, through what, and what it costs and how fast it starts. */
const Chosen = ({ m }: { m: PickerModel }) => {
  const t = useTranslations("service");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const facts = [
    m.source,
    fmtContext(m.context),
    m.price &&
      t("price", {
        input: nf.format(m.price.input),
        output: nf.format(m.price.output),
        sign: m.price.currency === "USD" ? "$" : "₽",
      }),
    m.firstTokenMs !== null &&
      t("firstToken", { n: nf.format(m.firstTokenMs / 1000) }),
  ].filter(Boolean);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandLogo label={m.makerTitle} logo={m.logo} size={24} />
      <span className="flex min-w-0 flex-col text-left leading-tight">
        <span className="truncate font-medium">{m.title}</span>
        <span className="text-muted-foreground truncate text-xs">
          {facts.join(" · ")}
        </span>
      </span>
    </span>
  );
};

/**
 * One row per job. A model is picked in the same palette as in the chat — search, makers, sorting by price and
 * latency, since a service job wants a cheap, fast model — among every model of a working source.
 */
export const SlotsForm = ({
  models,
  favorites: initialFavorites,
  recent,
  assigned,
}: {
  models: PickerModel[];
  favorites: string[];
  recent: string[];
  assigned: Record<string, string | null>;
}) => {
  const t = useTranslations("service");
  const favorites = useFavorites(initialFavorites);
  const [values, setValues] = useState(assigned);
  const [open, setOpen] = useState<ModelSlot | null>(null);
  const [, startTransition] = useTransition();
  const save = (slot: ModelSlot, modelId: string | null) => {
    setValues((v) => ({ ...v, [slot]: modelId }));
    startTransition(() => saveSlot(slot, modelId));
  };
  if (models.length === 0) {
    return <p className="text-muted-foreground">{t("empty")}</p>;
  }
  const byId = (id: string | null) => models.find((m) => m.id === id);
  return (
    <PickerDataProvider models={models} recent={recent}>
      <Section title={t("jobs")}>
        <Rows>
          {modelSlots.map((slot) => {
            const current = byId(values[slot] ?? null);
            return (
              <Row
                action={
                  current && (
                    <Button
                      aria-label={t("clear")}
                      onClick={() => save(slot, null)}
                      size="icon-sm"
                      title={t("clear")}
                      variant="ghost"
                    >
                      <X />
                    </Button>
                  )
                }
                hint={t(`slots.${slot}.hint`)}
                key={slot}
                label={t(`slots.${slot}.label`)}
              >
                <button
                  aria-label={t("choose", { job: t(`slots.${slot}.label`) })}
                  className="hover:bg-muted flex h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 transition-colors duration-150 md:w-80"
                  onClick={() => setOpen(slot)}
                  type="button"
                >
                  {current ? (
                    <Chosen m={current} />
                  ) : (
                    <span className="text-muted-foreground">{t("none")}</span>
                  )}
                  <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                </button>
              </Row>
            );
          })}
        </Rows>
      </Section>
      <ModelPalette
        current={byId(open ? (values[open] ?? null) : null)}
        favorites={favorites}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(null);
          }
        }}
        onPick={(m) => {
          if (open) {
            save(open, m.id);
          }
          setOpen(null);
        }}
        open={open !== null}
        opening={{ via: "mouse" }}
      />
    </PickerDataProvider>
  );
};
