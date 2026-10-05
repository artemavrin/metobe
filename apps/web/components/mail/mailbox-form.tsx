"use client";

import { MAIL_PRESETS } from "@metobe/contracts/email";
import type { MailPresetId, MailServer } from "@metobe/contracts/email";
import type { SaveResult } from "@metobe/core/mailboxes";
import { Button } from "@metobe/ui/components/button";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { Spinner } from "@metobe/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { addMailbox } from "@/app/(app)/mail-actions";
import {
  EMPTY_SERVER,
  NO_AUTOFILL,
  PasswordField,
  PresetPicker,
  ServerFields,
  problemText,
} from "@/components/mail/mail-fields";

// A mailbox, as people add one (ARCH §17.7): pick the service — its servers fill themselves in — the address and
// a password made for apps; «Другая» asks for both servers. Checked before anything is saved, with what went wrong
// said in the form. The same form in «Мои подключения» and in the chat's «connect to go on».

/** A box being connected again: its address stays, the rest starts as it was. */
export interface MailboxDraft {
  address: string;
  preset: MailPresetId;
  smtp: MailServer;
  imap: MailServer;
  username: string;
}

/** Where the form starts: a box connected again as it was, else Yandex and empty servers. */
const startOf = (initial?: MailboxDraft) => ({
  address: initial?.address ?? "",
  imap: initial?.imap ?? EMPTY_SERVER(993),
  preset: initial?.preset ?? ("yandex" as MailPresetId),
  smtp: initial?.smtp ?? EMPTY_SERVER(465),
  // The login is asked for only when it is not the address.
  username:
    initial && initial.username !== initial.address ? initial.username : "",
});

/** Enough to check: an address, a password, and — without a known service — both servers. */
const isReady = ({
  address,
  password,
  known,
  smtp,
  imap,
}: {
  address: string;
  password: string;
  known: unknown;
  smtp: MailServer;
  imap: MailServer;
}) => {
  if (!(address.includes("@") && password)) {
    return false;
  }
  return (
    Boolean(known) || Boolean(smtp.host && imap.host && smtp.port && imap.port)
  );
};

export const MailboxForm = ({
  onSaved,
  onCancel,
  initial,
  submitLabel,
}: {
  onSaved: (id: string) => void;
  onCancel?: () => void;
  initial?: MailboxDraft;
  submitLabel?: string;
}) => {
  const t = useTranslations("mail.form");
  const start0 = startOf(initial);
  const initialAddress = start0.address;
  const [preset, setPreset] = useState<MailPresetId>(start0.preset);
  const [address, setAddress] = useState(start0.address);
  const [username, setUsername] = useState(start0.username);
  const [password, setPassword] = useState("");
  const [smtp, setSmtp] = useState(start0.smtp);
  const [imap, setImap] = useState(start0.imap);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const known = preset === "custom" ? null : MAIL_PRESETS[preset];
  const ids = { address: useId(), password: useId(), username: useId() };
  const ready = isReady({ address, imap, known, password, smtp });
  const say = (result: Extract<SaveResult, { ok: false }>) =>
    problemText(result, Boolean(known), t);

  const submit = () =>
    start(async () => {
      setProblem(null);
      const result = await addMailbox({
        address: address.trim(),
        imap: known?.imap ?? imap,
        password,
        preset,
        smtp: known?.smtp ?? smtp,
        username: username.trim() || address.trim(),
      });
      if (result.ok) {
        setPassword("");
        onSaved(result.id);
      } else {
        setProblem(say(result));
      }
    });

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !pending) {
          submit();
        }
      }}
    >
      <PresetPicker
        onChange={(next) => {
          setPreset(next);
          setProblem(null);
        }}
        value={preset}
      />
      <Field>
        <FieldLabel htmlFor={ids.address}>{t("address")}</FieldLabel>
        <Input
          {...NO_AUTOFILL}
          autoFocus={!initialAddress}
          disabled={Boolean(initialAddress)}
          id={ids.address}
          inputMode="email"
          onChange={(e) => setAddress(e.target.value)}
          placeholder="name@example.com"
          value={address}
        />
      </Field>
      {preset === "custom" && (
        <Field>
          <FieldLabel htmlFor={ids.username}>{t("username")}</FieldLabel>
          <Input
            {...NO_AUTOFILL}
            id={ids.username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={address || t("usernameHint")}
            value={username}
          />
        </Field>
      )}
      <PasswordField
        autoFocus={Boolean(initialAddress)}
        id={ids.password}
        invalid={Boolean(problem)}
        onChange={setPassword}
        preset={preset}
        value={password}
      />
      {preset === "custom" && (
        <>
          <ServerFields label={t("smtp")} onChange={setSmtp} value={smtp} />
          <ServerFields label={t("imap")} onChange={setImap} value={imap} />
        </>
      )}
      {problem && <FieldError>{problem}</FieldError>}
      <div className="flex items-center justify-end gap-2">
        {onCancel && !pending && (
          <Button onClick={onCancel} type="button" variant="ghost">
            {t("cancel")}
          </Button>
        )}
        <Button aria-disabled={!ready || pending} type="submit">
          {pending && <Spinner />}
          {pending ? t("checking") : (submitLabel ?? t("submit"))}
        </Button>
      </div>
    </form>
  );
};
