"use client";

import type { ChatServer } from "@metobe/core/mcp";
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
import { InputGroup } from "@metobe/ui/components/input-group";
import { SecretInput } from "@metobe/ui/components/secret-input";
import { Spinner } from "@metobe/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/**
 * Connecting to a per-user MCP server from the chat with a token, a header's value or a login and password: the
 * user's own credentials, saved for them only and checked at once. OAuth never gets here — it opens the provider.
 */
export const ConnectDialog = ({
  server,
  onClose,
  onConnect,
}: {
  server: ChatServer | null;
  onClose: () => void;
  /** Saves and checks; false when the server refused the credentials. */
  onConnect: (secret: string, username?: string) => Promise<boolean>;
}) => {
  const t = useTranslations("chat.mcp");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [refused, setRefused] = useState(false);
  const [pending, start] = useTransition();
  const basic = server?.auth === "basic";
  let label = t("token");
  if (server?.auth === "header") {
    label = server.headerName ?? t("headerValue");
  } else if (basic) {
    label = t("password");
  }
  const submit = () =>
    start(async () => {
      setRefused(false);
      const ok = await onConnect(
        secret.trim(),
        basic ? username.trim() : undefined
      );
      if (ok) {
        setSecret("");
        setUsername("");
      } else {
        setRefused(true);
      }
    });
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setRefused(false);
          onClose();
        }
      }}
      open={server !== null}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("connectTitle", { server: server?.title ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("connectText")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          id="mcp-connect"
          onSubmit={(e) => {
            e.preventDefault();
            if (secret.trim() && !pending) {
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
                id="mcp-connect-login"
                onChange={(e) => setUsername(e.target.value)}
                value={username}
              />
            </Field>
          )}
          <Field data-invalid={refused}>
            <FieldLabel htmlFor="mcp-connect-secret">{label}</FieldLabel>
            <InputGroup>
              <SecretInput
                aria-invalid={refused}
                autoFocus={!basic}
                id="mcp-connect-secret"
                onChange={(e) => setSecret(e.target.value)}
                value={secret}
              />
            </InputGroup>
            {refused && <FieldError>{t("refused")}</FieldError>}
          </Field>
        </form>
        <DialogFooter>
          <Button
            disabled={!secret.trim() || pending}
            form="mcp-connect"
            type="submit"
          >
            {pending && <Spinner />}
            {t("connect")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
