"use client";

import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
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
import { cn } from "@metobe/ui/lib/utils";
import { useFormatter, useNow } from "next-intl";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Row } from "@/components/settings/rows";

import { type Connection, type Server, secretLabel } from "./data";
import type { Standing } from "./state";

export const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
} as const;

export const STANDING: Record<
  Standing,
  { dot: string; label: string; badge: "success-light" | "warning-light" | "destructive-light" | "info-light" | "secondary" }
> = {
  active: { badge: "success-light", dot: "bg-success", label: "Подключено" },
  admin: { badge: "secondary", dot: "bg-muted-foreground/40", label: "Ждёт администратора" },
  error: { badge: "destructive-light", dot: "bg-destructive", label: "Не работает" },
  needs_reauth: { badge: "warning-light", dot: "bg-warning", label: "Нужно войти заново" },
  none: { badge: "secondary", dot: "bg-muted-foreground/40", label: "Не подключено" },
  org: { badge: "info-light", dot: "bg-success", label: "Учётка организации" },
};

export const Dot = ({ standing, className }: { standing: Standing; className?: string }) => (
  <span aria-hidden className={cn("size-2 shrink-0 rounded-full transition-colors duration-200", STANDING[standing].dot, className)} />
);

export const Mark = ({ server, size = 28 }: { server: Server; size?: number }) => <BrandLogo label={server.title} logo={server.logo} size={size} />;

/** «использовался 2 часа назад», or that it has not been yet. */
export const useUsed = () => {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return (c: Connection | undefined) =>
    c?.lastUsedAt ? `использовался ${format.relativeTime(c.lastUsedAt, now)}` : "ещё не использовался";
};

/** What the user has saved, without a single character of a password. */
export const CredentialValue = ({ server, c }: { server: Server; c: Connection }) => {
  if (server.auth === "oauth") return <span className="text-sm">Вход выполнен</span>;
  if (server.auth === "basic")
    return (
      <span className="font-mono text-sm">
        {c.login} · ••••••
      </span>
    );
  return <span className="font-mono text-sm">{c.hint}</span>;
};

/** A one-line summary for lists: the login, a token's mask, or who you signed in through. */
export const credentialText = (server: Server, c: Connection) => {
  if (server.auth === "oauth") return `вход через ${server.title}`;
  if (server.auth === "basic") return `${c.login} · ••••••`;
  return c.hint ?? "";
};

export type Draft = ReturnType<typeof useDraft>;

export const useDraft = (c: Connection | undefined) => {
  const [login, setLogin] = useState(c?.login ?? "");
  const [secret, setSecret] = useState("");
  return { login, secret, setLogin, setSecret };
};

/**
 * The fields a server asks for: a login and a password, a token, or a header's value. `inline` sits in a row
 * editor; `stacked` — in a dialog, with labels. A saved secret stays unless a new one is typed.
 */
export const CredentialFields = ({
  server,
  c,
  draft,
  layout,
  error,
}: {
  server: Server;
  c: Connection | undefined;
  draft: Draft;
  layout: "inline" | "stacked";
  error?: string | null;
}) => {
  const label = secretLabel(server);
  // A saved secret can stay — unless the server refused it.
  const keep = c && c.status !== "error" ? "оставить прежний" : undefined;
  const loginInput = (
    <Input
      {...NO_AUTOFILL}
      aria-label="Логин"
      autoFocus
      className={cn("font-mono", layout === "inline" && "w-full sm:w-48")}
      id={`${server.id}-login`}
      onChange={(e) => draft.setLogin(e.target.value)}
      placeholder={layout === "inline" ? "Логин" : undefined}
      value={draft.login}
    />
  );
  const secretInput = (
    <InputGroup className={cn(layout === "inline" && (server.auth === "basic" ? "w-full sm:w-56" : "w-full"))}>
      <SecretInput
        aria-invalid={Boolean(error)}
        aria-label={label}
        autoFocus={server.auth !== "basic"}
        id={`${server.id}-secret`}
        onChange={(e) => draft.setSecret(e.target.value)}
        placeholder={keep ?? (layout === "inline" ? label : undefined)}
        value={draft.secret}
      />
    </InputGroup>
  );
  if (layout === "inline") {
    return (
      <>
        {server.auth === "basic" && loginInput}
        {secretInput}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {server.auth === "basic" && (
        <Field>
          <FieldLabel htmlFor={`${server.id}-login`}>Логин</FieldLabel>
          {loginInput}
        </Field>
      )}
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={`${server.id}-secret`}>{label}</FieldLabel>
        {secretInput}
        {error && <FieldError>{error}</FieldError>}
      </Field>
    </div>
  );
};

/**
 * A row whose value opens into an editor under it — the settings' EditRow, with the opening in the caller's hands
 * (a warning above can open it). The field(s), «Отмена», the main action, the error below.
 */
export const EditableRow = ({
  label,
  hint,
  value,
  editor,
  onSave,
  open,
  onOpenChange,
  action = "Изменить",
  primary = "Сохранить",
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  editor: ReactNode;
  onSave: () => Promise<string | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: string;
  primary?: string;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && formRef.current?.contains(e.target as Node)) {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);
  const submit = () =>
    start(async () => {
      setError(null);
      const problem = await onSave();
      if (problem) setError(problem);
      else onOpenChange(false);
    });
  return (
    <div>
      <Row
        action={
          !open && (
            <Button onClick={() => onOpenChange(true)} size="sm" variant="ghost">
              {action}
            </Button>
          )
        }
        hint={hint}
        label={label}
      >
        {value}
      </Row>
      {open && (
        <form
          className="animate-in fade-in fill-mode-both flex flex-col gap-2 px-4 pb-4 duration-150"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) submit();
          }}
          ref={formRef}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 basis-full flex-wrap gap-2 sm:flex-1 sm:basis-auto">{editor}</div>
            {!pending && (
              <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
                Отмена
              </Button>
            )}
            <Button aria-disabled={pending} type="submit">
              {pending && <Spinner />}
              {primary}
            </Button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </form>
      )}
    </div>
  );
};

/** OAuth: to the provider's page; «войти заново» when the sign-in has lapsed. */
export const SignInButton = ({
  server,
  busy,
  again,
  onClick,
  variant = "default",
  size = "default",
  className,
}: {
  server: Server;
  busy: boolean;
  again?: boolean;
  onClick: () => void;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  className?: string;
}) => (
  <Button aria-disabled={busy} className={className} onClick={() => !busy && onClick()} size={size} variant={variant}>
    {busy && <Spinner />}
    {busy ? `Открываем ${server.title}…` : again ? "Войти заново" : `Войти через ${server.title}`}
  </Button>
);

/** «Отключить Битрикс24?» — the user's credentials go, the server's tools leave their chats. */
export const DisconnectDialog = ({
  server,
  open,
  onOpenChange,
  onConfirm,
}: {
  server: Server | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Отключить {server?.title}?</DialogTitle>
        <DialogDescription>
          Ваша учётка удалится. Тулы {server?.title} пропадут из ваших чатов, пока вы не подключитесь снова.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Отмена</DialogClose>
        <Button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
          variant="destructive"
        >
          Отключить
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
