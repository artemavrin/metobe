"use client";

import { Button } from "@purr/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@purr/ui/components/field";
import { Input } from "@purr/ui/components/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@purr/ui/components/input-otp";
import { useActionState, useRef } from "react";

import { sendCode, verifyCode } from "./actions";
import type { SendCodeState, VerifyState } from "./actions";

const CODE_SLOTS = [0, 1, 2, 3, 4, 5];

export const CodeForm = ({
  email,
  initialCode = "",
}: {
  email: string;
  initialCode?: string;
}) => {
  const [state, action, pending] = useActionState<VerifyState, FormData>(
    verifyCode,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={action} ref={formRef}>
      <input name="email" type="hidden" value={email} />
      <FieldGroup>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor="code">Код из письма для {email}</FieldLabel>
          <InputOTP
            autoFocus
            defaultValue={initialCode}
            id="code"
            maxLength={6}
            name="code"
            onComplete={() => formRef.current?.requestSubmit()}
          >
            <InputOTPGroup>
              {CODE_SLOTS.map((index) => (
                <InputOTPSlot index={index} key={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {state.error && <FieldError>{state.error}</FieldError>}
        </Field>
        <Button disabled={pending} type="submit">
          Войти
        </Button>
      </FieldGroup>
    </form>
  );
};

export const LoginForm = ({ mailConfigured }: { mailConfigured: boolean }) => {
  const [state, action, pending] = useActionState<SendCodeState, FormData>(
    sendCode,
    { sent: false }
  );

  if (!mailConfigured) {
    return (
      <p className="text-muted-foreground text-sm">
        Вход по почте ещё не настроен. Попросите у администратора ссылку для
        входа.
      </p>
    );
  }
  if (state.sent && state.email) {
    return <CodeForm email={state.email} />;
  }
  return (
    <form action={action}>
      <FieldGroup>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            aria-invalid={Boolean(state.error)}
            autoComplete="email"
            autoFocus
            id="email"
            name="email"
            type="email"
          />
          {state.error && <FieldError>{state.error}</FieldError>}
        </Field>
        <Button disabled={pending} type="submit">
          Получить ссылку для входа
        </Button>
      </FieldGroup>
    </form>
  );
};
