"use client";

import { Button } from "@metobe/ui/components/button";
import { Field, FieldError } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { Spinner } from "@metobe/ui/components/spinner";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { addDomain, removeDomain } from "./actions";

// Who may sign in by themselves (D17): the email domains whose people get in by the code from the mail, with an account
// made at the first sign-in and the role «user». Nothing opens without the service's mail; a person already in needs
// no domain, and one deleted in «Пользователи» can sign in again for as long as their domain is listed.

const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
  spellCheck: false,
} as const;

/** The domain to add: one input, Enter or «Добавить»; what is wrong with it said under the field. */
const AddDomain = ({
  disabled,
  senderDomain,
}: {
  disabled: boolean;
  senderDomain: string | null;
}) => {
  const t = useTranslations("access");
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = (value: string) =>
    start(async () => {
      setProblem(null);
      const result = await addDomain(value);
      if (result.ok) {
        setDraft("");
      } else {
        setProblem(t(`problems.${result.reason}`));
      }
    });

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim() && !pending) {
          add(draft);
        }
      }}
    >
      <Field data-invalid={Boolean(problem)}>
        <div className="flex gap-2">
          <Input
            {...NO_AUTOFILL}
            aria-invalid={Boolean(problem)}
            aria-label={t("add.label")}
            className="font-mono"
            disabled={disabled || pending}
            onChange={(e) => {
              setDraft(e.target.value);
              setProblem(null);
            }}
            placeholder="example.com"
            value={draft}
          />
          <Button
            aria-disabled={disabled || pending || !draft.trim()}
            type="submit"
            variant="outline"
          >
            {pending ? <Spinner /> : <Plus />}
            {t("add.button")}
          </Button>
        </div>
        {problem && <FieldError>{problem}</FieldError>}
      </Field>
      {senderDomain && !disabled && (
        <p className="text-muted-foreground text-xs">
          {t("add.sender", { domain: senderDomain })}{" "}
          <button
            className="text-foreground underline-offset-2 hover:underline"
            onClick={() => add(senderDomain)}
            type="button"
          >
            {t("add.use", { domain: senderDomain })}
          </button>
        </p>
      )}
    </form>
  );
};

export const AccessSettings = ({
  domains,
  mailOn,
  senderDomain,
}: {
  domains: string[];
  mailOn: boolean;
  senderDomain: string | null;
}) => {
  const t = useTranslations("access");
  const [removing, start] = useTransition();
  return (
    <Section title={t("domains.title")}>
      {!mailOn && (
        <p className="text-muted-foreground -mt-1 text-sm">
          {t("noMail")}{" "}
          <Link
            className="text-foreground underline-offset-2 hover:underline"
            href="/settings/mail"
          >
            {t("toMail")}
          </Link>
        </p>
      )}
      {domains.length > 0 ? (
        <Rows>
          {domains.map((domain) => (
            <Row
              action={
                <Button
                  aria-label={t("remove", { domain })}
                  disabled={removing}
                  onClick={() => start(() => removeDomain(domain))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X />
                </Button>
              }
              hint={mailOn ? t("domains.hint") : t("domains.paused")}
              key={domain}
              label={`@${domain}`}
            />
          ))}
        </Rows>
      ) : (
        <p className="text-muted-foreground text-sm">{t("domains.empty")}</p>
      )}
      <AddDomain disabled={!mailOn} senderDomain={senderDomain} />
      <p className="text-muted-foreground text-xs">{t("note")}</p>
    </Section>
  );
};
