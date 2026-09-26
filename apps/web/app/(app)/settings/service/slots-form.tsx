"use client";

import { modelSlots } from "@metobe/contracts/models";
import type { ModelSlot } from "@metobe/contracts/models";
import { Button } from "@metobe/ui/components/button";
import { ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { PickerDataProvider } from "@/components/chat/picker/data";
import type { PickerModel } from "@/components/chat/picker/data";
import { ModelPalette } from "@/components/chat/picker/palette";
import { useFavorites } from "@/components/chat/picker/use-favorites";
import { Row, Rows, Section } from "@/components/settings/rows";

import { saveSlot } from "./actions";

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
                      size="icon-xs"
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
                  className="hover:bg-muted flex h-8 max-w-64 items-center gap-1.5 rounded-lg px-2 text-sm [transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease] active:scale-[0.97] motion-reduce:active:scale-100"
                  onClick={() => setOpen(slot)}
                  type="button"
                >
                  {current ? (
                    <>
                      <BrandLogo
                        label={current.makerTitle}
                        logo={current.logo}
                        size={16}
                      />
                      <span className="truncate">{current.title}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t("none")}</span>
                  )}
                  <ChevronDown className="size-3.5 shrink-0 opacity-50" />
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
