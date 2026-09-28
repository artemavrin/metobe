"use client";

import { Button } from "@metobe/ui/components/button";
import { FieldError } from "@metobe/ui/components/field";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { CircleCheck } from "lucide-react";

import { AUTH_LABEL, toolsWord } from "../my-connections/data";
import { CredentialFields, Mark, useDraft } from "../my-connections/parts";
import type { Request } from "./state";

// What every variant says, in the same words: who is asked for and why, the fields of its way of signing in, what
// went wrong, and that it is connected. Variants differ in where this sits and how much of it shows at once.

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
export const ENTER = `animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ${EASE}`;

/** «Битрикс24 · 14 тулов · логин и пароль». */
export const metaOf = (r: Request) => {
  const s = r.scenario.server;
  return `${toolsWord(s.toolCount)} · ${AUTH_LABEL[s.auth].toLowerCase()}`;
};

/** The service asked for and the model's line on why. */
export const Head = ({ r, size = 36 }: { r: Request; size?: number }) => (
  <div className="flex min-w-0 items-start gap-3">
    <Mark server={r.scenario.server} size={size} />
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="font-medium">
        Подключите {r.scenario.server.title}, чтобы продолжить
      </p>
      <p className="text-muted-foreground text-sm">{r.scenario.reason}</p>
      <p className="text-muted-foreground/80 text-xs">{metaOf(r)}</p>
    </div>
  </div>
);

/**
 * The way in: the fields and «Подключить», or «Войти через X» for OAuth; the server's refusal under them. Submitting
 * checks at once — nothing is saved that the server did not take.
 */
export const SignIn = ({
  r,
  layout,
  onDismiss,
  className,
}: {
  r: Request;
  layout: "inline" | "stacked";
  onDismiss?: () => void;
  className?: string;
}) => {
  const draft = useDraft(undefined);
  const s = r.scenario.server;
  const busy = r.phase === "connecting" || (r.oauth.open && r.oauth.phase === "waiting");
  const ready = s.auth === "oauth" || (draft.secret.trim() && (s.auth !== "basic" || draft.login.trim()));
  return (
    <form
      className={cn("flex flex-col gap-2", className)}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) r.connect(draft);
      }}
    >
      {s.auth !== "oauth" && (
        <div className={cn("flex gap-2", layout === "inline" ? "flex-col sm:flex-row" : "flex-col")}>
          <fieldset className={cn("flex min-w-0 flex-1 gap-2", layout === "inline" ? "flex-col sm:flex-row" : "flex-col")} disabled={busy}>
            <CredentialFields c={undefined} draft={draft} error={r.problem} layout={layout} server={s} />
          </fieldset>
        </div>
      )}
      {r.problem && <FieldError className={ENTER}>{r.problem}</FieldError>}
      <div className={cn("flex items-center gap-2", layout === "stacked" && "justify-end")}>
        {onDismiss && (
          <Button disabled={busy} onClick={onDismiss} type="button" variant="ghost">
            Не сейчас
          </Button>
        )}
        <Button aria-disabled={!ready || busy} className={cn(layout === "inline" && "order-first")} type="submit">
          {busy && <Spinner />}
          {s.auth === "oauth" ? `Войти через ${s.title}` : busy ? "Проверяем…" : "Подключить"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {s.auth === "oauth"
          ? `Откроется окно ${s.title}. Мы не видим ваш пароль — только разрешение, которое вы дадите.`
          : "Учётка ваша: другие её не видят. Сменить или отключить — в «Моих подключениях»."}
      </p>
    </form>
  );
};

/** Connected: a line in place of the card — who, with what (a login, a token's mask, never a password). */
export const Connected = ({ r }: { r: Request }) => (
  <div className={cn("text-muted-foreground flex min-w-0 items-center gap-2 text-sm", ENTER)}>
    <CircleCheck className="text-success size-4 shrink-0" />
    <span className="truncate">
      {r.scenario.server.title} подключён
      {r.saved && <span className="font-mono"> · {r.saved}</span>}
      {r.scenario.server.auth === "oauth" && " · вход через OAuth"}
    </span>
  </div>
);

/** Put off: the card folds to a line that still lets you connect. */
export const Dismissed = ({ r }: { r: Request }) => (
  <div className={cn("text-muted-foreground flex min-w-0 items-center gap-2 text-sm", ENTER)}>
    <Mark server={r.scenario.server} size={18} />
    <span className="truncate">{r.scenario.server.title} не подключён</span>
    <Button className="h-7 px-2" onClick={r.reopen} size="sm" variant="ghost">
      Подключить
    </Button>
  </div>
);
