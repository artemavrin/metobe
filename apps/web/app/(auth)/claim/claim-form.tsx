"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { useActionState } from "react";

import { claim } from "./actions";
import type { ClaimState } from "./actions";

export const ClaimForm = ({ token }: { token: string }) => {
  const [state, action, pending] = useActionState<ClaimState, FormData>(
    claim,
    {}
  );
  return (
    <form action={action}>
      <input name="token" type="hidden" value={token} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Как вас зовут</FieldLabel>
          <Input autoComplete="name" autoFocus id="name" name="name" />
        </Field>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input autoComplete="email" id="email" name="email" type="email" />
          {state.error && <FieldError>{state.error}</FieldError>}
        </Field>
        <Button disabled={pending} type="submit">
          Создать аккаунт
        </Button>
      </FieldGroup>
    </form>
  );
};
