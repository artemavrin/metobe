"use client";

import { limitedRoles } from "@metobe/contracts/limits";
import type {
  ChatLimit,
  ChatLimits,
  LimitedRole,
} from "@metobe/contracts/limits";
import { Field, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { EditRow } from "@/components/settings/edit-row";
import { Rows, Section } from "@/components/settings/rows";

import { saveLimit } from "./actions";

// How many chat messages each role may send (ARCH §10): a row per role, its limits opening into two fields. The
// owner is not here — they have no limits.

/** «12» → 12, «» → null (no limit); anything else is NaN, which the server refuses. */
const countOf = (text: string) => {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed);
};

const draftOf = (count: number | null) => (count === null ? "" : String(count));

const RoleRow = ({ role, limit }: { role: LimitedRole; limit: ChatLimit }) => {
  const t = useTranslations("limits");
  const tRoles = useTranslations("settings.roles");
  const format = useFormatter();
  const ids = { day: useId(), minute: useId() };
  const [minute, setMinute] = useState(draftOf(limit.perMinute));
  const [day, setDay] = useState(draftOf(limit.perDay));
  const parts = [
    limit.perMinute !== null &&
      t("value.perMinute", { count: format.number(limit.perMinute) }),
    limit.perDay !== null &&
      t("value.perDay", { count: format.number(limit.perDay) }),
  ].filter(Boolean);
  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void
  ) => (
    <Field className="flex-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        onChange={(e) => set(e.target.value)}
        placeholder={t("empty")}
        value={value}
      />
    </Field>
  );
  return (
    <EditRow
      editor={
        <div className="flex gap-3">
          {field(ids.minute, t("perMinute"), minute, setMinute)}
          {field(ids.day, t("perDay"), day, setDay)}
        </div>
      }
      label={tRoles(role)}
      onSave={async () =>
        (await saveLimit(role, {
          perDay: countOf(day),
          perMinute: countOf(minute),
        }))
          ? null
          : t("invalid")
      }
      value={
        <span className="tabular-nums">
          {parts.length > 0 ? parts.join(" · ") : t("value.none")}
        </span>
      }
    />
  );
};

export const LimitsSettings = ({ limits }: { limits: ChatLimits }) => {
  const t = useTranslations("limits");
  return (
    <Section title={t("section")}>
      <Rows>
        {limitedRoles.map((role) => (
          <RoleRow key={role} limit={limits[role]} role={role} />
        ))}
      </Rows>
      <p className="text-muted-foreground text-xs">{t("note")}</p>
    </Section>
  );
};
