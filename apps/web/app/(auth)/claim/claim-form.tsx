"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { claim } from "./actions";
import type { ClaimState } from "./actions";

export const ClaimForm = ({ token }: { token: string }) => {
  const [state, action, pending] = useActionState<ClaimState, FormData>(
    claim,
    {}
  );
  const t = useTranslations("claim");
  return (
    <form action={action}>
      <input name="token" type="hidden" value={token} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
          <Input autoComplete="name" autoFocus id="name" name="name" />
        </Field>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input autoComplete="email" id="email" name="email" type="email" />
          {state.error && <FieldError>{state.error}</FieldError>}
        </Field>
        <Button disabled={pending} type="submit">
          {t("create")}
        </Button>
      </FieldGroup>
    </form>
  );
};
