"use client";

import { MAIL_PRESETS } from "@metobe/contracts/email";
import type { MailPresetId, MailServer } from "@metobe/contracts/email";
import type { MailCheck, MailResult, ServiceMail } from "@metobe/core/mail";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metobe/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { RefreshCw, Send } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import {
  EMPTY_SERVER,
  NO_AUTOFILL,
  PasswordField,
  PresetPicker,
  ServerFields,
  problemText,
} from "@/components/mail/mail-fields";
import { EditRow } from "@/components/settings/edit-row";
import { Row, Rows, Section } from "@/components/settings/rows";

import { recheck, renameSender, saveMail, sendTest, turnOff } from "./actions";

// The service's mail (D15): the box the sign-in codes and invitations go from. Set up with the same pieces as a
// user's own box, but SMTP only, with who the letters are from; then whether it works, a test letter, turning it off.

type TForm = ReturnType<typeof useTranslations<"mail.form">>;

/** What a check or a letter found, in the form's words. */
const resultText = (result: MailResult, known: boolean, tf: TForm) =>
  result.ok ? null : problemText({ ...result, server: "smtp" }, known, tf);

/** Where the form starts: the mail being changed as it is, else Yandex and an empty server. */
const startOf = (initial: ServiceMail | null) => ({
  address: initial?.address ?? "",
  name: initial?.name ?? "",
  preset: initial?.preset ?? ("yandex" as MailPresetId),
  smtp: initial?.smtp ?? EMPTY_SERVER(465),
  // The login is asked for only when it is not the address.
  username:
    initial?.username && initial.username !== initial.address
      ? initial.username
      : "",
});

/** Who the letters are from: the address — a box of the service's own — and the name the inbox shows. */
const SenderFields = ({
  address,
  name,
  onAddress,
  onName,
  autoFocus,
}: {
  address: string;
  name: string;
  onAddress: (next: string) => void;
  onName: (next: string) => void;
  autoFocus: boolean;
}) => {
  const t = useTranslations("serviceMail.form");
  const ids = { address: useId(), name: useId() };
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <Field className="sm:flex-[3]">
        <FieldLabel htmlFor={ids.address}>{t("address")}</FieldLabel>
        <Input
          {...NO_AUTOFILL}
          autoFocus={autoFocus}
          id={ids.address}
          inputMode="email"
          onChange={(e) => onAddress(e.target.value)}
          placeholder="noreply@example.com"
          value={address}
        />
      </Field>
      <Field className="sm:flex-[2]">
        <FieldLabel htmlFor={ids.name}>{t("name")}</FieldLabel>
        <Input
          {...NO_AUTOFILL}
          id={ids.name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Metobe"
          value={name}
        />
      </Field>
    </div>
  );
};

/** «Другая»: the login, when it is not the address, and the server. */
const CustomServer = ({
  address,
  username,
  onUsername,
  smtp,
  onSmtp,
}: {
  address: string;
  username: string;
  onUsername: (next: string) => void;
  smtp: MailServer;
  onSmtp: (next: MailServer) => void;
}) => {
  const tf = useTranslations("mail.form");
  const id = useId();
  return (
    <>
      <Field>
        <FieldLabel htmlFor={id}>{tf("username")}</FieldLabel>
        <Input
          {...NO_AUTOFILL}
          id={id}
          onChange={(e) => onUsername(e.target.value)}
          placeholder={address || tf("usernameHint")}
          value={username}
        />
      </Field>
      <ServerFields label={tf("smtp")} onChange={onSmtp} value={smtp} />
    </>
  );
};

/** The box the service sends from: which service, the address and name it sends as, the login. */
const ServiceMailForm = ({
  initial,
  onDone,
}: {
  initial: ServiceMail | null;
  /** Saved or cancelled; without it there is nothing to go back to. */
  onDone?: () => void;
}) => {
  const t = useTranslations("serviceMail.form");
  const tf = useTranslations("mail.form");
  const start0 = startOf(initial);
  const [preset, setPreset] = useState(start0.preset);
  const [address, setAddress] = useState(start0.address);
  const [name, setName] = useState(start0.name);
  const [username, setUsername] = useState(start0.username);
  const [password, setPassword] = useState("");
  const [smtp, setSmtp] = useState(start0.smtp);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const known = preset === "custom" ? null : MAIL_PRESETS[preset];
  const passwordId = useId();
  // A known service takes a password; «Другая» may let the service in without one, but needs its server.
  const ready =
    address.includes("@") &&
    (known ? Boolean(password) : Boolean(smtp.host && smtp.port));

  const submit = () =>
    start(async () => {
      setProblem(null);
      const result = await saveMail({
        address: address.trim(),
        name: name.trim(),
        password,
        preset,
        smtp: known?.smtp ?? smtp,
        username: username.trim(),
      });
      if (result.ok) {
        setPassword("");
        onDone?.();
      } else if (result.problem === "invalid") {
        setProblem(t("invalid"));
      } else {
        setProblem(resultText(result, Boolean(known), tf));
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
      <SenderFields
        address={address}
        autoFocus={!initial}
        name={name}
        onAddress={setAddress}
        onName={setName}
      />
      <div className="flex flex-col gap-1.5">
        <PasswordField
          autoFocus={Boolean(initial)}
          id={passwordId}
          invalid={Boolean(problem)}
          onChange={setPassword}
          preset={preset}
          value={password}
        />
        {!known && (
          <p className="text-muted-foreground text-xs">{t("noPassword")}</p>
        )}
      </div>
      {!known && (
        <CustomServer
          address={address}
          onSmtp={setSmtp}
          onUsername={setUsername}
          smtp={smtp}
          username={username}
        />
      )}
      {problem && <FieldError>{problem}</FieldError>}
      <div className="flex items-center justify-end gap-2">
        {onDone && !pending && (
          <Button onClick={onDone} type="button" variant="ghost">
            {tf("cancel")}
          </Button>
        )}
        <Button aria-disabled={!ready || pending} type="submit">
          {pending && <Spinner />}
          {pending ? tf("checking") : t("submit")}
        </Button>
      </div>
    </form>
  );
};

const checkDot = (check: MailCheck | null, busy: boolean) => {
  if (busy) {
    return "bg-warning animate-pulse";
  }
  if (!check) {
    return "bg-muted-foreground/40";
  }
  return check.ok ? "bg-success" : "bg-destructive";
};

/** Whether the server took the service in at the last check or letter, and when that was. */
const CheckState = ({
  check,
  busy,
  known,
}: {
  check: MailCheck | null;
  busy: boolean;
  known: boolean;
}) => {
  const t = useTranslations("serviceMail.check");
  const tf = useTranslations("mail.form");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  let label = t("never");
  if (busy) {
    label = t("running");
  } else if (check) {
    label = resultText(check, known, tf) ?? t("ok");
  }
  const at = check && !busy ? new Date(check.checkedAt) : null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={cn("size-2 shrink-0 rounded-full", checkDot(check, busy))}
      />
      <span
        className="min-w-0 truncate"
        title={check && !check.ok ? check.detail : label}
      >
        {label}
      </span>
      {at && (
        <span className="text-muted-foreground shrink-0 text-xs">
          {format.relativeTime(at > now ? now : at, now)}
        </span>
      )}
    </span>
  );
};

/** A letter to the admin themselves: the surest check that the codes get through. */
const TestLetter = ({ me, known }: { me: string; known: boolean }) => {
  const t = useTranslations("serviceMail.test");
  const tf = useTranslations("mail.form");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState<MailResult | null>(null);
  const failed = sent && !sent.ok ? resultText(sent, known, tf) : null;
  let hint = t("hint", { email: me });
  if (sent?.ok) {
    hint = t("sent", { email: me });
  } else if (failed) {
    hint = failed;
  }
  return (
    <Section title={t("title")}>
      <Rows>
        <Row
          action={
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setSent(null);
                  setSent(await sendTest());
                })
              }
              size="sm"
              variant="outline"
            >
              {pending ? <Spinner /> : <Send />}
              {pending ? t("sending") : t("send")}
            </Button>
          }
          hint={hint}
          label={t("label")}
        />
      </Rows>
    </Section>
  );
};

/** Turning the mail off: its own section, a red button, a confirmation — as removing anything in the settings. */
const TurnOff = () => {
  const t = useTranslations("serviceMail.off");
  return (
    <Section title={t("title")}>
      <Rows>
        <Row
          action={
            <Dialog>
              <DialogTrigger
                render={<Button size="sm" variant="destructive" />}
              >
                {t("button")}
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("confirmTitle")}</DialogTitle>
                  <DialogDescription>{t("hint")}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="ghost" />}>
                    {t("cancel")}
                  </DialogClose>
                  <Button onClick={() => turnOff()} variant="destructive">
                    {t("confirm")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
          hint={t("hint")}
          label={t("button")}
        />
      </Rows>
    </Section>
  );
};

export const MailSettings = ({
  mail,
  me,
}: {
  mail: ServiceMail | null;
  me: string;
}) => {
  const t = useTranslations("serviceMail");
  const tf = useTranslations("mail.form");
  const [editing, setEditing] = useState(false);
  const [checking, startCheck] = useTransition();
  const [name, setName] = useState(mail?.name ?? "");

  if (!mail) {
    return (
      <Section title={t("setUp")}>
        <p className="text-muted-foreground -mt-1 text-sm">{t("none")}</p>
        <div className="rounded-lg border p-4">
          <ServiceMailForm initial={null} />
        </div>
      </Section>
    );
  }

  const known = mail.preset !== "custom";
  const { host, port, security } = mail.smtp;
  return (
    <>
      <Section
        action={
          <Button
            disabled={checking}
            onClick={() => startCheck(() => recheck())}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn(checking && "animate-spin")} />
            {t("recheck")}
          </Button>
        }
        title={t("sender")}
      >
        <Rows>
          <Row label={t("address")}>
            <span className="block truncate font-mono text-sm">
              {mail.address}
            </span>
          </Row>
          <EditRow
            editor={
              <Input
                {...NO_AUTOFILL}
                aria-label={t("name.label")}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="Metobe"
                value={name}
              />
            }
            hint={t("name.hint")}
            label={t("name.label")}
            onSave={async () => {
              await renameSender(name);
              return null;
            }}
            value={<span className="block truncate">{mail.name}</span>}
          />
          <Row
            action={
              !editing && (
                <Button
                  onClick={() => setEditing(true)}
                  size="sm"
                  variant="ghost"
                >
                  {t("change")}
                </Button>
              )
            }
            hint={
              mail.username
                ? t("loginAs", { login: mail.username })
                : t("noLogin")
            }
            label={t("server")}
          >
            <span className="font-mono text-sm">
              {`${host}:${port} · ${tf(`securities.${security}`)}`}
            </span>
          </Row>
          <Row label={t("check.label")}>
            <CheckState busy={checking} check={mail.check} known={known} />
          </Row>
        </Rows>
        {editing && (
          <div className="rounded-lg border p-4">
            <ServiceMailForm initial={mail} onDone={() => setEditing(false)} />
          </div>
        )}
      </Section>
      <TestLetter known={known} me={me} />
      <TurnOff />
    </>
  );
};
