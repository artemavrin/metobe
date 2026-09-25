"use client";

import { Button } from "@metobe/ui/components/button";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@metobe/ui/components/input-otp";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, MailX } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { AuthHeading, stepEnter } from "@/components/auth/auth-heading";
import { SubmitButton } from "@/components/auth/submit-button";

import { sendCode, verifyCode } from "./actions";
import type { SendCodeState, VerifyState } from "./actions";

const CODE_SLOTS = [0, 1, 2, 3, 4, 5];
const RESEND_SECONDS = 30;

/** Seconds left before the code can be sent again, counting down from mount. */
const useCooldown = (seconds: number) => {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      return;
    }
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return left;
};

/**
 * Six digits, sent as soon as the last one is typed. A rejected code clears the slots and shakes the row once,
 * so the next attempt starts clean.
 */
const CodeInput = ({
  email,
  initialCode = "",
}: {
  email: string;
  initialCode?: string;
}) => {
  const [state, action, pending] = useActionState<VerifyState, FormData>(
    useMemo(() => verifyCode.bind(null, email), [email]),
    {}
  );
  const t = useTranslations("login");
  const [, startTransition] = useTransition();
  // input-otp is always controlled internally, so the value lives here rather than in defaultValue.
  const [code, setCode] = useState(initialCode);
  const [misses, setMisses] = useState(0);
  // Each answer from the server is handled once, during render: a miss clears the slots and counts for the shake.
  const [answered, setAnswered] = useState(state);
  if (state !== answered) {
    setAnswered(state);
    if (state.error) {
      setCode("");
      setMisses((m) => m + 1);
    }
  }

  // No <form>, no field names: password managers scan forms and take a code next to an email for a login.
  const submit = (value: string) => {
    const form = new FormData();
    form.set("code", value);
    startTransition(() => action(form));
  };

  return (
    <div>
      <Field data-invalid={Boolean(state.error)}>
        <FieldLabel className="sr-only" htmlFor="login-digits">
          {t("codeTitle")}
        </FieldLabel>
        {/* Full column width, like the email field. The key replays the shake (and refocuses) on every miss */}
        <div
          className={cn(
            "relative",
            misses > 0 && "animate-shake motion-reduce:animate-none"
          )}
          key={misses}
        >
          {/* No browser or password-manager autofill: they offer to fill «passwords» into the code slots */}
          <InputOTP
            autoComplete="off"
            autoFocus
            containerClassName="w-full"
            data-1p-ignore
            data-bwignore
            data-form-type="other"
            data-lpignore="true"
            disabled={pending}
            id="login-digits"
            maxLength={6}
            onChange={setCode}
            onComplete={submit}
            pattern="^[0-9]*$"
            value={code}
          >
            <InputOTPGroup
              className={cn(
                "w-full transition-opacity",
                pending && "opacity-50"
              )}
            >
              {CODE_SLOTS.map((index) => (
                <InputOTPSlot
                  aria-invalid={Boolean(state.error)}
                  className="h-12 flex-1 text-lg"
                  index={index}
                  key={index}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {/* Sits on the border between the third and fourth slots, clear of the digits */}
          {pending && (
            <Spinner className="text-muted-foreground absolute top-1/2 left-1/2 -translate-1/2" />
          )}
        </div>
        {state.error && <FieldError>{state.error}</FieldError>}
      </Field>
    </div>
  );
};

/** The code step on its own: the /login/verify page, where the link pre-fills it. */
export const CodeStep = ({
  email,
  initialCode,
  footer,
}: {
  email: string;
  initialCode?: string;
  footer?: React.ReactNode;
}) => {
  const t = useTranslations("login");
  return (
    <div className={stepEnter()}>
      <AuthHeading title={t("codeTitle")}>
        {email && (
          <>
            {t("sentTo")}{" "}
            <span className="text-foreground font-medium break-words">
              {email}
            </span>
          </>
        )}
      </AuthHeading>
      <CodeInput email={email} initialCode={initialCode} />
      <p className="text-muted-foreground mt-6 text-sm">{t("orLink")}</p>
      <div className="mt-8 flex items-center justify-between gap-3 border-t pt-4 text-sm">
        {footer ?? (
          <Button
            className="text-muted-foreground -ml-2 h-7 gap-1.5 px-2 font-normal"
            nativeButton={false}
            render={<Link href="/login" />}
            size="sm"
            variant="ghost"
          >
            <ArrowLeft />
            {t("otherEmail")}
          </Button>
        )}
      </div>
    </div>
  );
};

/** «Другой email» and the resend with its cooldown, under the code on the sign-in page. */
const CodeFooter = ({
  email,
  onBack,
  resend,
  resending,
}: {
  email: string;
  onBack: () => void;
  resend: (form: FormData) => void;
  resending: boolean;
}) => {
  const t = useTranslations("login");
  const left = useCooldown(RESEND_SECONDS);
  return (
    <>
      <Button
        className="text-muted-foreground -ml-2 h-7 gap-1.5 px-2 font-normal"
        onClick={onBack}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ArrowLeft />
        {t("otherEmail")}
      </Button>
      <form action={resend}>
        <input name="email" type="hidden" value={email} />
        <Button
          className="text-muted-foreground h-auto p-0 font-normal tabular-nums hover:bg-transparent"
          disabled={left > 0 || resending}
          size="sm"
          type="submit"
          variant="ghost"
        >
          {left > 0 ? t("resendIn", { seconds: left }) : t("resend")}
        </Button>
      </form>
    </>
  );
};

export const LoginForm = ({ mailConfigured }: { mailConfigured: boolean }) => {
  const [state, action, pending] = useActionState<SendCodeState, FormData>(
    sendCode,
    { sent: false }
  );
  const t = useTranslations("login");
  // «Другой email» steps back without losing what was typed; a new send moves forward again.
  const [editing, setEditing] = useState(false);
  const [answered, setAnswered] = useState(state);
  if (state !== answered) {
    setAnswered(state);
    setEditing(false);
  }

  if (!mailConfigured) {
    return (
      <div className={stepEnter()}>
        <span className="bg-muted mb-6 inline-flex size-10 items-center justify-center rounded-xl border">
          <MailX className="text-muted-foreground size-5" />
        </span>
        <AuthHeading className="mb-0" title={t("title")}>
          {t("mailNotConfigured")}
        </AuthHeading>
      </div>
    );
  }
  if (state.sent && state.email && !editing) {
    return (
      <CodeStep
        email={state.email}
        footer={
          <CodeFooter
            email={state.email}
            onBack={() => setEditing(true)}
            resend={action}
            resending={pending}
          />
        }
        // A resend restarts the step: fresh slots, a fresh cooldown.
        key={state.sentAt}
      />
    );
  }
  return (
    <div className={stepEnter(editing)}>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input
            aria-invalid={Boolean(state.error)}
            autoComplete="email"
            autoFocus
            className="h-10"
            defaultValue={state.email}
            id="email"
            inputMode="email"
            name="email"
            type="email"
          />
          {state.error && <FieldError>{state.error}</FieldError>}
        </Field>
        <SubmitButton pending={pending}>{t("send")}</SubmitButton>
      </form>
    </div>
  );
};
