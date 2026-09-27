"use client";

import type { MyCredential } from "@metobe/core/catalog";
import type { MyServer } from "@metobe/core/mcp";
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
import { Input } from "@metobe/ui/components/input";
import { InputGroup } from "@metobe/ui/components/input-group";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@metobe/ui/components/reui/alert";
import { SecretInput } from "@metobe/ui/components/secret-input";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { CircleAlert } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import {
  OAuthWindowDialog,
  useOAuthWindow,
} from "@/components/mcp/oauth-window";
import { EditRow } from "@/components/settings/edit-row";
import { Row, Rows, Section } from "@/components/settings/rows";
import { standingOf } from "@/lib/my-connections";
import type { Standing } from "@/lib/my-connections";

import { leaveMine, saveMine, signInMine } from "./actions";

// One server of «Подключения» (P8 «Погружение · 2»): where it stands, the user's own account — a login and password,
// a token or a header's value, or an OAuth sign-in in the provider's window — and, in a section of its own at the
// end, leaving it, the way anything is removed in the settings. A shared server has nothing to enter.

const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
} as const;

const DOT: Record<Standing, string> = {
  active: "bg-success",
  admin: "bg-muted-foreground/40",
  error: "bg-destructive",
  needs_reauth: "bg-warning",
  none: "bg-muted-foreground/40",
  org: "bg-success",
};

type T = ReturnType<typeof useTranslations<"myConnections">>;

/** Where it stands, when it was last used, how many tools it gives — one line under the title. */
const useStatusLine = (server: MyServer, standing: Standing) => {
  const t = useTranslations("myConnections");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const used = () => {
    const at = server.connection?.lastUsedAt;
    if (standing !== "active") {
      return null;
    }
    return at
      ? t("used", { when: format.relativeTime(at, now) })
      : t("notUsed");
  };
  return [
    t(`standing.${standing}`),
    used(),
    // Unknown until the server first answers: «0 тулов» would read as «it has none».
    server.toolCount > 0 ? t("tools", { count: server.toolCount }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/** The field a server asks for, named as it knows it: a header's name, a password, a token. */
const secretLabelOf = (server: MyServer, t: T) => {
  if (server.auth === "header") {
    return server.headerName ?? t("headerValue");
  }
  return server.auth === "basic" ? t("password") : t("token");
};

/**
 * The user's own login and password, token or header value: the fields, and saving them — checked right away. A
 * working secret may stay (the login changes alone); a refused one has to be replaced.
 */
const useCredentialEditor = (
  server: MyServer,
  credential: MyCredential,
  standing: Standing
) => {
  const t = useTranslations("myConnections");
  const router = useRouter();
  const [login, setLogin] = useState(credential.login ?? "");
  const [secret, setSecret] = useState("");
  const basic = server.auth === "basic";
  const keep = standing === "active";
  const label = secretLabelOf(server, t);
  const check = () => {
    if (basic && !login.trim()) {
      return t("errors.loginMissing");
    }
    if (basic && login.includes(":")) {
      return t("errors.loginColon");
    }
    if (!(secret.trim() || keep)) {
      return basic ? t("errors.passwordMissing") : t("errors.valueMissing");
    }
    return null;
  };
  const save = async () => {
    const problem = check();
    if (problem) {
      return problem;
    }
    const result = await saveMine(server.id, { secret, username: login });
    router.refresh();
    if (result.ok) {
      setSecret("");
      return null;
    }
    return result.problem === "failed"
      ? t("errors.failed")
      : t("errors.refused");
  };
  const editor = (
    <>
      {basic && (
        <Input
          {...NO_AUTOFILL}
          aria-label={t("username")}
          autoFocus
          className="w-full font-mono sm:w-48"
          onChange={(e) => setLogin(e.target.value)}
          placeholder={t("username")}
          value={login}
        />
      )}
      <InputGroup className={cn("w-full", basic && "sm:w-56")}>
        <SecretInput
          aria-label={label}
          autoFocus={!basic}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={keep ? t("secretKeep") : label}
          value={secret}
        />
      </InputGroup>
    </>
  );
  return { editor, label: basic ? t("login") : label, save };
};

/** What is wrong and what to do: sign in again, replace the refused credentials, or wait for the admin. */
const Problem = ({
  server,
  standing,
  onSignIn,
}: {
  server: MyServer;
  standing: Standing;
  onSignIn: () => void;
}) => {
  const t = useTranslations("myConnections");
  if (server.mode === "shared") {
    return standing === "admin" || standing === "error" ? (
      <Alert>
        <CircleAlert />
        <AlertTitle>{t("adminWait.title")}</AlertTitle>
        <AlertDescription>{t("adminWait.text")}</AlertDescription>
      </Alert>
    ) : null;
  }
  if (standing !== "needs_reauth" && standing !== "error") {
    return null;
  }
  return (
    <Alert variant={standing === "error" ? "destructive" : "warning"}>
      <CircleAlert />
      <AlertTitle>
        {t(`alert.${standing}`, { server: server.title })}
      </AlertTitle>
      <AlertDescription>
        {t(`broken.${standing}`, { server: server.title })}
      </AlertDescription>
      {server.auth === "oauth" && (
        <AlertAction>
          <Button onClick={() => onSignIn()} size="sm">
            {t("oauth.again")}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
};

/** A connection that exists: the account (edited in place, or the OAuth sign-in) and when it was made. */
const AccountSection = ({
  server,
  credential,
  standing,
  onSignIn,
}: {
  server: MyServer;
  credential: MyCredential;
  standing: Standing;
  onSignIn: () => void;
}) => {
  const t = useTranslations("myConnections");
  const format = useFormatter();
  const credentials = useCredentialEditor(server, credential, standing);
  const created = server.connection?.createdAt;
  return (
    <Section title={t("account")}>
      <Rows>
        {server.auth === "oauth" ? (
          <Row
            action={
              standing === "active" && (
                <Button onClick={() => onSignIn()} size="sm" variant="outline">
                  {t("oauth.again")}
                </Button>
              )
            }
            hint={t("oauth.hint", { server: server.title })}
            label={t("oauth.label")}
          >
            <span className="text-sm">
              {standing === "active" ? t("oauth.signedIn") : t("oauth.expired")}
            </span>
          </Row>
        ) : (
          <EditRow
            defaultOpen={standing === "error"}
            editor={credentials.editor}
            label={credentials.label}
            onSave={() => credentials.save()}
            value={
              <span className="font-mono text-sm">
                {server.auth === "basic"
                  ? `${credential.login ?? ""} · ••••••`
                  : (credential.hint ?? "••••••")}
              </span>
            }
          />
        )}
        {created && (
          <Row label={t("connected")}>
            <span className="text-sm">
              {format.dateTime(created, { dateStyle: "long" })}
            </span>
          </Row>
        )}
      </Rows>
    </Section>
  );
};

/** Not connected yet: the fields and «Проверить и подключить», or the provider's window for OAuth. */
const ConnectSection = ({
  server,
  credential,
  onSignIn,
}: {
  server: MyServer;
  credential: MyCredential;
  onSignIn: () => void;
}) => {
  const t = useTranslations("myConnections");
  const credentials = useCredentialEditor(server, credential, "none");
  return (
    <Section title={t("connect")}>
      <Rows>
        {server.auth === "oauth" ? (
          <Row
            action={
              <Button onClick={() => onSignIn()} size="sm">
                {t("oauth.via", { server: server.title })}
              </Button>
            }
            hint={t("oauth.viaHint", { server: server.title })}
            label={t("oauth.viaLabel", { server: server.title })}
          />
        ) : (
          <EditRow
            action={t("connectAction")}
            editor={credentials.editor}
            label={credentials.label}
            onSave={() => credentials.save()}
            primary={t("check")}
            value={
              <span className="text-muted-foreground text-sm">
                {t("notSet")}
              </span>
            }
          />
        )}
      </Rows>
      <p className="text-muted-foreground text-xs">
        {t("afterConnect", { server: server.title })}
      </p>
    </Section>
  );
};

/** Leaving, as removing anything in the settings: its own section, a red button, a confirmation. */
const LeaveSection = ({ server }: { server: MyServer }) => {
  const t = useTranslations("myConnections");
  const router = useRouter();
  const [pending, start] = useTransition();
  const { title } = server;
  return (
    <Section title={t("leave.section")}>
      <Rows>
        <Row
          action={
            <Dialog>
              <DialogTrigger
                render={<Button size="sm" variant="destructive" />}
              >
                {t("leave.title", { server: title })}
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {t("leave.confirm", { server: title })}
                  </DialogTitle>
                  <DialogDescription>
                    {t("leave.text", {
                      count: server.toolCount,
                      server: title,
                    })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="ghost" />}>
                    {t("leave.cancel")}
                  </DialogClose>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await leaveMine(server.id);
                        router.refresh();
                      })
                    }
                    variant="destructive"
                  >
                    {pending && <Spinner />}
                    {t("leave.action")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
          hint={t("leave.hint")}
          label={t("leave.title", { server: title })}
        />
      </Rows>
    </Section>
  );
};

export const MyServerPage = ({
  server,
  credential,
}: {
  server: MyServer;
  credential: MyCredential;
}) => {
  const t = useTranslations("myConnections");
  const router = useRouter();
  const standing = standingOf(server);
  const line = useStatusLine(server, standing);
  const own = server.mode === "per_user";
  // A sign-in only started counts as not connected: nothing to edit or leave yet.
  const connected = own && server.connection !== null && standing !== "none";
  const oauth = useOAuthWindow({ onDone: () => router.refresh() });
  const signIn = () =>
    oauth.start(server, (returnTo) => signInMine(server.id, returnTo));

  return (
    <>
      <header className="flex items-center gap-3">
        <BrandLogo
          label={server.title}
          logo={server.logo ?? undefined}
          size={48}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {server.title}
          </h1>
          <p className="text-muted-foreground flex items-baseline gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 translate-y-[-1px] rounded-full",
                DOT[standing]
              )}
            />
            <span>{line}</span>
          </p>
        </div>
      </header>
      <Problem onSignIn={signIn} server={server} standing={standing} />
      {!own && (
        <Section title={t("shared.section")}>
          <Rows>
            <Row hint={t("shared.hint")} label={t("shared.label")} />
          </Rows>
        </Section>
      )}
      {connected && (
        <AccountSection
          credential={credential}
          onSignIn={signIn}
          server={server}
          standing={standing}
        />
      )}
      {own && !connected && (
        <ConnectSection
          credential={credential}
          onSignIn={signIn}
          server={server}
        />
      )}
      {connected && <LeaveSection server={server} />}
      <OAuthWindowDialog flow={oauth} />
    </>
  );
};
