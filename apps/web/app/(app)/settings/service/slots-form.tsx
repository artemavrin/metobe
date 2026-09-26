"use client";

import { modelSlots } from "@metobe/contracts/models";
import type { ModelSlot } from "@metobe/contracts/models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Row, Rows, Section } from "@/components/settings/rows";

import { saveSlot } from "./actions";

interface Candidate {
  id: string;
  title: string;
  maker: string;
  logo: string | undefined;
  source: string;
  inChat: boolean;
}

const NONE = "none";

const ModelOption = ({ c, notInChat }: { c: Candidate; notInChat: string }) => (
  <span className="flex min-w-0 items-center gap-2">
    <BrandLogo label={c.maker} logo={c.logo} size={18} />
    <span className="truncate">{c.title}</span>
    <span className="text-muted-foreground truncate text-xs">
      {c.source}
      {!c.inChat && ` · ${notInChat}`}
    </span>
  </span>
);

/** One row per job; a choice is saved as it is made. */
export const SlotsForm = ({
  candidates,
  assigned,
}: {
  candidates: Candidate[];
  assigned: Record<string, string | null>;
}) => {
  const t = useTranslations("service");
  const [values, setValues] = useState(assigned);
  const [, startTransition] = useTransition();
  const pick = (slot: ModelSlot, value: string) => {
    const modelId = value === NONE ? null : value;
    setValues((v) => ({ ...v, [slot]: modelId }));
    startTransition(() => saveSlot(slot, modelId));
  };
  if (candidates.length === 0) {
    return <p className="text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <Section title={t("jobs")}>
      <Rows>
        {modelSlots.map((slot) => {
          const current = candidates.find((c) => c.id === values[slot]);
          return (
            <Row
              hint={t(`slots.${slot}.hint`)}
              key={slot}
              label={t(`slots.${slot}.label`)}
            >
              <Select
                onValueChange={(v) => pick(slot, String(v))}
                value={values[slot] ?? NONE}
              >
                <SelectTrigger
                  aria-label={t(`slots.${slot}.label`)}
                  className="w-full md:w-80"
                >
                  <SelectValue>
                    {current ? (
                      <ModelOption c={current} notInChat={t("notInChat")} />
                    ) : (
                      t("none")
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={NONE}>{t("none")}</SelectItem>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <ModelOption c={c} notInChat={t("notInChat")} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          );
        })}
      </Rows>
    </Section>
  );
};
