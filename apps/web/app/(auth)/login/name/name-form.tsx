"use client";

import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { SubmitButton } from "@/components/auth/submit-button";

import { saveName } from "./actions";
import type { NameState } from "./actions";

export const NameForm = () => {
  const [state, action, pending] = useActionState<NameState, FormData>(
    saveName,
    {}
  );
  const t = useTranslations("login.name");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field data-invalid={Boolean(state.error)}>
        <FieldLabel htmlFor="name">{t("label")}</FieldLabel>
        <Input
          aria-invalid={Boolean(state.error)}
          autoComplete="name"
          autoFocus
          className="h-10"
          id="name"
          name="name"
        />
        {state.error && <FieldError>{state.error}</FieldError>}
      </Field>
      <SubmitButton pending={pending}>{t("continue")}</SubmitButton>
    </form>
  );
};
