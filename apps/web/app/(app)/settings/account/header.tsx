"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Spinner } from "@metobe/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LogoPicker } from "@/components/logo-picker";

import {
  confirmEmailChange,
  saveAvatar,
  saveName,
  sendNewEmailCode,
  startEmailChange,
} from "./actions";
import type { EmailStep } from "./actions";

// The top of the account, as on a source's page: the picture, the name to edit in place, the sign-in email and the
// role. The email is the account's login, so changing it takes a code from the old address and one from the new.

type Step = "address" | "current" | "new";

/** The three steps of changing the email, in one dialog. */
const EmailDialog = ({
  email,
  open,
  onClose,
}: {
  email: string;
  open: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("profile.email");
  const router = useRouter();
  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reset = () => {
    setStep("address");
    setAddress("");
    setCode("");
    setProblem(null);
    onClose();
  };
  const said = (result: Extract<EmailStep, { ok: false }>) =>
    t(`problems.${result.problem}`);
  const submit = () =>
    start(async () => {
      setProblem(null);
      if (step === "address") {
        const result = await startEmailChange(address);
        if (result.ok) {
          setStep("current");
        } else {
          setProblem(said(result));
        }
      } else if (step === "current") {
        const result = await sendNewEmailCode(address, code);
        if (result.ok) {
          setCode("");
          setStep("new");
        } else {
          setProblem(said(result));
        }
      } else {
        const result = await confirmEmailChange(address, code);
        if (result.ok) {
          reset();
          router.refresh();
        } else {
          setProblem(said(result));
        }
      }
    });
  const ready =
    step === "address" ? address.includes("@") : code.trim().length >= 6;
  return (
    <Dialog onOpenChange={(o) => !o && reset()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {step === "address" && t("stepAddress", { email })}
            {step === "current" && t("stepCurrent", { email })}
            {step === "new" && t("stepNew", { address })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          id="email-change"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !pending) {
              submit();
            }
          }}
        >
          <Field data-invalid={Boolean(problem)}>
            <FieldLabel htmlFor="email-change-input">
              {step === "address" ? t("newLabel") : t("codeLabel")}
            </FieldLabel>
            {step === "address" ? (
              <Input
                autoComplete="off"
                autoFocus
                id="email-change-input"
                inputMode="email"
                onChange={(e) => setAddress(e.target.value)}
                placeholder="name@example.com"
                value={address}
              />
            ) : (
              <Input
                autoComplete="one-time-code"
                autoFocus
                className="font-mono tracking-widest"
                id="email-change-input"
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replaceAll(/\D/gu, ""))}
                placeholder="000000"
                value={code}
              />
            )}
            {problem && <FieldError>{problem}</FieldError>}
          </Field>
        </form>
        <DialogFooter>
          <Button onClick={reset} type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            aria-disabled={!ready || pending}
            form="email-change"
            type="submit"
          >
            {pending && <Spinner />}
            {t(`next.${step}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AccountHeader = ({
  name,
  email,
  image,
  role,
  canChangeEmail,
}: {
  name: string;
  email: string;
  image: string | null;
  role: string;
  canChangeEmail: boolean;
}) => {
  const t = useTranslations("profile");
  const tr = useTranslations("settings.roles");
  const [nameDraft, setNameDraft] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [, start] = useTransition();
  const roleKey = role === "superuser" || role === "admin" ? role : "user";
  const commitName = () => {
    const next = nameDraft.trim();
    if (next === name) {
      setNameDraft(name);
      return;
    }
    start(async () => {
      const result = next ? await saveName(next) : { ok: false as const };
      setProblem(result.ok ? null : t("name.invalid"));
      if (!result.ok) {
        setNameDraft(name);
      }
    });
  };
  return (
    <header className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-4">
        <LogoPicker
          label={name}
          onPick={(picked) =>
            start(async () => {
              const result = await saveAvatar(picked);
              setProblem(result.ok ? null : t("avatar.failed"));
            })
          }
          person
          size={64}
          value={image ?? undefined}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Input
            aria-label={t("name.label")}
            autoComplete="off"
            className="hover:border-input h-8 border-transparent bg-transparent px-1.5 text-xl font-semibold shadow-none md:text-xl dark:bg-transparent"
            maxLength={100}
            onBlur={commitName}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            value={nameDraft}
          />
          <div className="flex flex-wrap items-center gap-2 px-1.5">
            <span className="text-muted-foreground font-mono text-xs">
              {email}
            </span>
            <Button
              className="h-6 px-2 text-xs"
              disabled={!canChangeEmail}
              onClick={() => setEmailOpen(true)}
              size="sm"
              title={canChangeEmail ? undefined : t("email.mailOff")}
              variant="ghost"
            >
              {t("email.change")}
            </Button>
            <Badge variant="secondary">{tr(roleKey)}</Badge>
          </div>
        </div>
      </div>
      {problem && (
        <p className="text-destructive px-1.5 text-xs" role="alert">
          {problem}
        </p>
      )}
      <EmailDialog
        email={email}
        onClose={() => setEmailOpen(false)}
        open={emailOpen}
      />
    </header>
  );
};
