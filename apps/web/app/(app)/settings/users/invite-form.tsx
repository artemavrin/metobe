"use client";

import type { InvitableRole } from "@metobe/contracts/members";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { Check, Copy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { createInvite, revokeInvite } from "./actions";
import type { InviteResult } from "./actions";

// A new invitation (D17): a role, an address if the link is for one person, and the link itself, shown once with a
// copy button. Under it, the invitations still open, each to take back.

interface Open {
  id: string;
  role: string;
  email: string | null;
  expiresAt: string;
  createdByName: string | null;
}

const DAYS = 7;

export const InviteForm = ({
  roles,
  open,
  mailOn,
}: {
  roles: InvitableRole[];
  open: Open[];
  /** The service can send letters: a link with no address then checks the mailbox by a code, and one with it is mailed. */
  mailOn: boolean;
}) => {
  const t = useTranslations("users");
  const f = useFormatter();
  const router = useRouter();
  const [role, setRole] = useState<InvitableRole>(roles.at(-1) ?? "user");
  const [email, setEmail] = useState("");
  const [made, setMade] = useState<Extract<InviteResult, { ok: true }> | null>(
    null
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, startCreate] = useTransition();
  const [revoking, startRevoke] = useTransition();

  const needsAddress = !(mailOn || email.trim());

  const copy = async () => {
    if (!made) {
      return;
    }
    await navigator.clipboard.writeText(made.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {t("invite.title")}
        </h1>
        <p className="text-muted-foreground">{t("invite.description")}</p>
      </header>

      {made ? (
        <Section title={t("invite.ready")}>
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Input
                aria-label={t("invite.ready")}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
                readOnly
                value={made.url}
              />
              <Button onClick={copy} type="button" variant="outline">
                {copied ? <Check /> : <Copy />}
                {copied ? t("invite.copied") : t("invite.copy")}
              </Button>
            </div>
            {made.mailed !== null && (
              <p className="text-sm">
                {t(made.mailed ? "invite.mailed" : "invite.notMailed", {
                  email,
                })}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              {t("invite.readyHint", { days: DAYS })}
            </p>
            <div>
              <Button
                onClick={() => {
                  setMade(null);
                  setEmail("");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("invite.another")}
              </Button>
            </div>
          </div>
        </Section>
      ) : (
        <Section title={t("invite.role")}>
          <Rows>
            <Row hint={t(`roleHints.${role}`)} label={t("invite.role")}>
              <Select
                onValueChange={(next) => next && setRole(next as InvitableRole)}
                value={role}
              >
                <SelectTrigger className="w-48">
                  <SelectValue>{t(`roles.${role}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`roles.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row
              hint={t(mailOn ? "invite.emailHint" : "invite.emailHintNoMail")}
              label={t("invite.email")}
            >
              <Input
                autoComplete="off"
                className="w-64"
                inputMode="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("invite.emailPlaceholder")}
                type="email"
                value={email}
              />
            </Row>
          </Rows>
          {failed && (
            <p className="text-destructive text-sm" role="alert">
              {failed}
            </p>
          )}
          {needsAddress && (
            <p className="text-muted-foreground text-sm">
              {t("invite.needMail")}{" "}
              <Link
                className="text-foreground underline-offset-2 hover:underline"
                href="/settings/mail"
              >
                {t("invite.toMail")}
              </Link>
            </p>
          )}
          <div>
            <Button
              disabled={creating || needsAddress}
              onClick={() =>
                startCreate(async () => {
                  const result = await createInvite(role, email);
                  setFailed(
                    result.ok
                      ? null
                      : t(
                          result.reason === "mail"
                            ? "invite.failedMail"
                            : "invite.failed"
                        )
                  );
                  if (result.ok) {
                    setMade(result);
                    router.refresh();
                  }
                })
              }
              type="button"
            >
              {creating && <Spinner />}
              {t("invite.create")}
            </Button>
          </div>
        </Section>
      )}

      <Section title={t("invite.open.section")}>
        {open.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("invite.open.empty")}
          </p>
        ) : (
          <Rows>
            {open.map((i) => (
              <Row
                action={
                  <Button
                    disabled={revoking}
                    onClick={() =>
                      startRevoke(async () => {
                        await revokeInvite(i.id);
                        router.refresh();
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {t("invite.open.revoke")}
                  </Button>
                }
                hint={[
                  t("invite.open.until", {
                    date: f.dateTime(new Date(i.expiresAt), {
                      dateStyle: "long",
                    }),
                  }),
                  i.email ? t("invite.open.for", { email: i.email }) : null,
                  i.createdByName
                    ? t("invite.open.by", { name: i.createdByName })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                key={i.id}
                label={t(`roles.${i.role as InvitableRole}`)}
              />
            ))}
          </Rows>
        )}
      </Section>
    </>
  );
};
