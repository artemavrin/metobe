"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@metobe/ui/components/input-group";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { SecretInput } from "@metobe/ui/components/secret-input";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { CircleAlert, Eye, EyeOff, Lock, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";

type Auth = ChatServer["auth"];

/** What the secret is called: the field's label and the word in the line on how it is kept. */
const secretOf = (auth: Auth | undefined) => {
  if (auth === "basic") {
    return { label: "password", what: "password" } as const;
  }
  if (auth === "header") {
    return { label: "headerValue", what: "key" } as const;
  }
  return { label: "token", what: "token" } as const;
};

/** The secret drawn as dots, with an eye to show it once there is something to show. */
const SecretField = ({
  id,
  value,
  onChange,
  invalid,
  disabled,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled: boolean;
  autoFocus: boolean;
}) => {
  const t = useTranslations("chat.mcp");
  const [shown, setShown] = useState(false);
  return (
    <InputGroup>
      <SecretInput
        aria-invalid={invalid}
        autoFocus={autoFocus}
        className={cn(shown && "[-webkit-text-security:none]")}
        disabled={disabled}
        id={id}
        onChange={(e) => onChange(e.target.value)}
        value={value}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={shown ? t("hide") : t("show")}
            onClick={() => setShown(!shown)}
            size="icon-xs"
          >
            {shown ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
};

/** One wide button: «Войти» or «Подключить»; «Проверяем…» while the server checks; «Повторить» after it was silent. */
const SubmitButton = ({
  basic,
  ready,
  pending,
  silent,
}: {
  basic: boolean;
  ready: boolean;
  pending: boolean;
  silent: boolean;
}) => {
  const t = useTranslations("chat.mcp");
  let content: React.ReactNode = basic ? t("signIn") : t("connect");
  if (pending) {
    content = (
      <>
        <Spinner />
        {t("checking")}
      </>
    );
  } else if (silent) {
    content = (
      <>
        <RotateCw />
        {t("retry")}
      </>
    );
  }
  return (
    <Button
      className="w-full"
      disabled={!ready || pending}
      form="mcp-connect"
      type="submit"
    >
      {content}
    </Button>
  );
};

/**
 * Signing in to a per-user MCP server from the chat with a login and password, a token or a header's value — the
 * user's own credentials, saved for them only and checked at once (prototype `/dev/prototypes/mcp-sign-in`, «Вход»):
 * the service's logo and name in the middle, what it is in the admin's words, the fields, one wide button. The name
 * goes in quotes and is never declined. OAuth never gets here — it opens the provider.
 */
export const ConnectDialog = ({
  server,
  onClose,
  onConnect,
}: {
  server: ChatServer | null;
  onClose: () => void;
  /** Saves and checks: `refused` — the server did not take the credentials; `error` — it did not answer. */
  onConnect: (
    secret: string,
    username?: string
  ) => Promise<"ok" | "refused" | "error">;
}) => {
  const t = useTranslations("chat.mcp");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [problem, setProblem] = useState<"refused" | "error" | null>(null);
  const [pending, start] = useTransition();
  const basic = server?.auth === "basic";
  const title = server?.title ?? "";
  const kind = secretOf(server?.auth);
  const headerName = server?.auth === "header" ? server.headerName : null;
  const ready = secret.trim() !== "" && (!basic || username.trim() !== "");
  const submit = () =>
    start(async () => {
      setProblem(null);
      const result = await onConnect(
        secret.trim(),
        basic ? username.trim() : undefined
      );
      if (result === "ok") {
        setSecret("");
        setUsername("");
      } else {
        setProblem(result);
      }
    });
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setProblem(null);
          onClose();
        }
      }}
      open={server !== null}
    >
      <DialogContent className="gap-5 p-6 pt-8 sm:max-w-[22rem]">
        <DialogHeader className="items-center gap-3 text-center">
          <BrandLogo label={title} logo={server?.logo ?? undefined} size={48} />
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-lg text-balance">
              {basic
                ? t("signInTitle", { server: title })
                : t("connectTitle", { server: title })}
            </DialogTitle>
            {/* What the service is, in the admin's words; nothing when they wrote none. */}
            {server?.description && (
              <DialogDescription className="text-balance">
                {server.description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          id="mcp-connect"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !pending) {
              submit();
            }
          }}
        >
          {basic && (
            <Field>
              <FieldLabel htmlFor="mcp-connect-login">
                {t("username")}
              </FieldLabel>
              <Input
                autoComplete="off"
                autoFocus
                data-1p-ignore
                data-lpignore="true"
                disabled={pending}
                id="mcp-connect-login"
                onChange={(e) => setUsername(e.target.value)}
                value={username}
              />
            </Field>
          )}
          <Field data-invalid={problem === "refused"}>
            <FieldLabel className="gap-2" htmlFor="mcp-connect-secret">
              {t(kind.label)}
              {headerName && (
                <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-normal">
                  {headerName}
                </code>
              )}
            </FieldLabel>
            <SecretField
              autoFocus={!basic}
              disabled={pending}
              id="mcp-connect-secret"
              invalid={problem === "refused"}
              onChange={setSecret}
              value={secret}
            />
            {problem === "refused" && (
              <FieldError>
                {basic ? t("refusedLogin") : t("refusedKey")}
              </FieldError>
            )}
          </Field>
          {problem === "error" && (
            <Alert variant="warning">
              <CircleAlert />
              <AlertDescription>
                {t("unreachable", { server: title })}
              </AlertDescription>
            </Alert>
          )}
        </form>
        <div className="flex flex-col gap-3">
          <SubmitButton
            basic={basic}
            pending={pending}
            ready={ready}
            silent={problem === "error"}
          />
          <p className="text-muted-foreground text-center text-xs text-balance">
            <Lock className="mr-1 inline size-3.5 -translate-y-px align-middle" />
            {t("kept", { what: kind.what })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
