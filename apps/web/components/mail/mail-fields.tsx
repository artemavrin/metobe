"use client";

import { MAIL_PRESETS, mailPresetIds } from "@metobe/contracts/email";
import type {
  MailPresetId,
  MailSecurity,
  MailServer,
} from "@metobe/contracts/email";
import type { MailProblem } from "@metobe/core/smtp";
import { Field, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { InputGroup } from "@metobe/ui/components/input-group";
import { SecretInput } from "@metobe/ui/components/secret-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@metobe/ui/components/toggle-group";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

// The pieces of a mail form, the same for a user's own box and for the service's mail: which service, a server,
// the password for it, and what a server's refusal means.

export const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
  spellCheck: false,
} as const;

export const EMPTY_SERVER = (port: number): MailServer => ({
  host: "",
  port,
  security: "ssl",
});

/** One server of «Другая»: host, port, encryption. */
export const ServerFields = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MailServer;
  onChange: (next: MailServer) => void;
}) => {
  const t = useTranslations("mail.form");
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <Input
          {...NO_AUTOFILL}
          className="min-w-0 flex-1 basis-40 font-mono"
          id={id}
          onChange={(e) => onChange({ ...value, host: e.target.value.trim() })}
          placeholder="mail.example.com"
          value={value.host}
        />
        <Input
          {...NO_AUTOFILL}
          aria-label={t("port")}
          className="w-20 font-mono"
          inputMode="numeric"
          onChange={(e) =>
            onChange({ ...value, port: Number(e.target.value) || 0 })
          }
          value={value.port || ""}
        />
        <Select
          onValueChange={(v) =>
            onChange({ ...value, security: v as MailSecurity })
          }
          value={value.security}
        >
          <SelectTrigger aria-label={t("security")} className="w-32">
            <SelectValue>{t(`securities.${value.security}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(["ssl", "starttls", "none"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {t(`securities.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
};

/** Which mail: the known services fill their servers in; «Другая» asks for them. */
export const PresetPicker = ({
  value,
  onChange,
}: {
  value: MailPresetId;
  onChange: (next: MailPresetId) => void;
}) => {
  const t = useTranslations("mail.form");
  return (
    <Field>
      <FieldLabel>{t("service")}</FieldLabel>
      <ToggleGroup
        className="flex-wrap"
        onValueChange={(v) => {
          const next = v[0] as MailPresetId | undefined;
          if (next) {
            onChange(next);
          }
        }}
        spacing={1}
        value={[value]}
        variant="outline"
      >
        {mailPresetIds.map((p) => (
          <ToggleGroupItem key={p} value={p}>
            {t(`presets.${p}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
};

/** The password — for a known service, one made for apps, with where to make it. Never shown, not even in part. */
export const PasswordField = ({
  id,
  preset,
  value,
  onChange,
  invalid,
  autoFocus,
}: {
  id: string;
  preset: MailPresetId;
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
  autoFocus: boolean;
}) => {
  const t = useTranslations("mail.form");
  const known = preset === "custom" ? null : MAIL_PRESETS[preset];
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>
        {known ? t("appPassword") : t("password")}
      </FieldLabel>
      <InputGroup>
        <SecretInput
          aria-invalid={invalid}
          autoFocus={autoFocus}
          id={id}
          onChange={(e) => onChange(e.target.value)}
          value={value}
        />
      </InputGroup>
      {known && preset !== "custom" && (
        <p className="text-muted-foreground text-xs">
          {t(`hints.${preset}`)}{" "}
          {known.appPasswordUrl && (
            <a
              className="text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
              href={known.appPasswordUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("makeAppPassword")}
              <ExternalLink className="size-3" />
            </a>
          )}
        </p>
      )}
    </Field>
  );
};

/** What went wrong, in the form's words. */
export const problemText = (
  result: { problem: MailProblem | "busy"; server?: "smtp" | "imap" },
  known: boolean,
  t: ReturnType<typeof useTranslations<"mail.form">>
) => {
  if (result.problem === "busy") {
    return t("problems.busy");
  }
  if (result.problem === "auth") {
    return known ? t("problems.authPreset") : t("problems.auth");
  }
  return t(`problems.${result.problem}`, {
    server: result.server === "imap" ? "IMAP" : "SMTP",
  });
};
