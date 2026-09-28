"use client";

import type { ToolApproval } from "@metobe/contracts/catalog";
import { mailTools, policyOf } from "@metobe/contracts/email";
import type {
  MailPresetId,
  MailServer,
  MailTool,
  MailToolPolicy,
} from "@metobe/contracts/email";
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
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { cn } from "@metobe/ui/lib/utils";
import { Mail } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { deleteMailbox, setMailboxToolPolicy } from "@/app/(app)/mail-actions";
import { MailboxForm } from "@/components/mail/mailbox-form";
import { Row, Rows, Section } from "@/components/settings/rows";

// One mailbox: whether it works and when it was used, its servers, a new password, and leaving — as removing
// anything in the settings: its own section, a red button, a confirmation.

interface Box {
  id: string;
  address: string;
  preset: MailPresetId;
  smtp: MailServer;
  imap: MailServer;
  username: string;
  status: "active" | "needs_reauth" | "error";
  toolPolicy: MailToolPolicy;
  lastError: string | null;
  lastUsedAt: string | null;
}

const DOT = {
  active: "bg-success",
  error: "bg-destructive",
  needs_reauth: "bg-warning",
} as const;

const APPROVALS: ToolApproval[] = ["ask", "auto", "deny"];

/** What the model may do with the box: each tool asks first, goes without asking, or is off. Saved at once. */
const ToolPolicies = ({ box }: { box: Box }) => {
  const t = useTranslations("mail.policy");
  const [, start] = useTransition();
  const [policy, setPolicy] = useOptimistic(
    box.toolPolicy,
    (current, change: { tool: MailTool; value: ToolApproval }) => ({
      ...current,
      [change.tool]: change.value,
    })
  );
  return (
    <Section title={t("title")}>
      <Rows>
        {mailTools.map((tool) => {
          const value = policyOf(policy, tool);
          return (
            <Row
              hint={t(`tools.${tool}.hint`)}
              key={tool}
              label={t(`tools.${tool}.label`)}
            >
              <Select
                onValueChange={(v) =>
                  start(async () => {
                    setPolicy({ tool, value: v as ToolApproval });
                    await setMailboxToolPolicy(box.id, tool, String(v));
                  })
                }
                value={value}
              >
                <SelectTrigger
                  aria-label={t(`tools.${tool}.label`)}
                  className="w-full md:w-44"
                >
                  <SelectValue>{t(`values.${value}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {APPROVALS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {t(`values.${a}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          );
        })}
      </Rows>
    </Section>
  );
};

export const MailboxPage = ({ box }: { box: Box }) => {
  const t = useTranslations("mail.page");
  const ts = useTranslations("mail.status");
  const tf = useTranslations("mail.form");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const [reconnecting, setReconnecting] = useState(box.status !== "active");
  const server = (s: MailServer) =>
    `${s.host}:${s.port} · ${tf(`securities.${s.security}`)}`;
  const used = box.lastUsedAt
    ? t("used", { when: format.relativeTime(new Date(box.lastUsedAt), now) })
    : t("notUsed");
  return (
    <>
      <header className="flex min-w-0 items-center gap-3">
        <IconTile size="lg" variant="frame">
          <Mail />
        </IconTile>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {box.address}
          </h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <span className={cn("size-2 rounded-full", DOT[box.status])} />
            {ts(box.status)} · {used}
          </p>
        </div>
      </header>

      <ToolPolicies box={box} />

      <Section title={t("servers")}>
        <Rows>
          <Row label={t("smtp")}>
            <span className="font-mono text-sm">{server(box.smtp)}</span>
          </Row>
          <Row label={t("imap")}>
            <span className="font-mono text-sm">{server(box.imap)}</span>
          </Row>
          <Row label={t("login")}>
            <span className="font-mono text-sm">{box.username}</span>
          </Row>
          <Row
            action={
              !reconnecting && (
                <Button
                  onClick={() => setReconnecting(true)}
                  size="sm"
                  variant="ghost"
                >
                  {t("reconnect")}
                </Button>
              )
            }
            hint={
              box.status === "active" ? undefined : (box.lastError ?? undefined)
            }
            label={t("password")}
          >
            <span className="font-mono text-sm">••••••</span>
          </Row>
        </Rows>
        {reconnecting && (
          <div className="rounded-lg border p-4">
            <MailboxForm
              initial={box}
              onCancel={
                box.status === "active"
                  ? () => setReconnecting(false)
                  : undefined
              }
              onSaved={() => {
                setReconnecting(false);
                router.refresh();
              }}
              submitLabel={t("reconnect")}
            />
          </div>
        )}
      </Section>

      <Section title={t("leave")}>
        <Rows>
          <Row
            action={
              <Dialog>
                <DialogTrigger
                  render={<Button size="sm" variant="destructive" />}
                >
                  {t("leaveButton", { address: box.address })}
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {t("leaveTitle", { address: box.address })}
                    </DialogTitle>
                    <DialogDescription>{t("leaveHint")}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>
                      {t("cancel")}
                    </DialogClose>
                    <Button
                      onClick={async () => {
                        await deleteMailbox(box.id);
                        router.push("/settings/connections");
                      }}
                      variant="destructive"
                    >
                      {t("leaveConfirm")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            }
            hint={t("leaveHint")}
            label={t("leaveButton", { address: box.address })}
          />
        </Rows>
      </Section>
    </>
  );
};
