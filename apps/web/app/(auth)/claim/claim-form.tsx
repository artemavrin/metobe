"use client";

import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";

import { claim } from "./actions";
import type { ClaimState } from "./actions";

export const ClaimForm = ({ token }: { token: string }) => {
  const [state, action, pending] = useActionState<ClaimState, FormData>(
    claim,
    {}
  );
  const t = useTranslations("claim");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input name="token" type="hidden" value={token} />
      <Field>
        <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
        <Input
          autoComplete="name"
          autoFocus
          className="h-10"
          id="name"
          name="name"
        />
      </Field>
      <Field data-invalid={Boolean(state.error)}>
        <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
        <Input
          aria-invalid={Boolean(state.error)}
          autoComplete="email"
          className="h-10"
          id="email"
          inputMode="email"
          name="email"
          type="email"
        />
        {state.error && <FieldError>{state.error}</FieldError>}
      </Field>
      <SubmitButton pending={pending}>{t("create")}</SubmitButton>
    </form>
  );
};
