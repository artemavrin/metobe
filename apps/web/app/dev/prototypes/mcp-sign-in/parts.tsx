"use client";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@metobe/ui/components/button";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@metobe/ui/components/input-group";
import { SecretInput } from "@metobe/ui/components/secret-input";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { CircleAlert, CircleCheck, Eye, EyeOff, Lock, RotateCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { REASON, SERVERS, useProto } from "./state";
import type { Server, Status } from "./state";

// What the three variants share: the stage (the chat dimmed behind; a centred dialog on a computer, a sheet from the
// bottom on a phone), the fields for each way in with their states, the line on where the secret goes, the model's
// reason, the «connected» view. A click on the button plays the check: «Проверяем…», then connected.

export const useServer = (): Server => SERVERS[useProto().auth];

/** The demo's own run of the states: the knob sets one, «Войти» plays checking → connected. */
export const useFlow = () => {
  const { status, setStatus } = useProto();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const submit = () => {
    setStatus("checking");
    timer.current = setTimeout(() => setStatus("done"), 1400);
  };
  return { status, submit };
};

const ChatBehind = () => (
  <div aria-hidden className="flex h-full flex-col gap-4 p-6">
    <div className="bg-muted ml-auto h-10 w-2/3 max-w-md rounded-2xl" />
    <div className="flex flex-col gap-2">
      <div className="bg-muted/70 h-3 w-5/6 rounded" />
      <div className="bg-muted/70 h-3 w-4/6 rounded" />
      <div className="bg-muted/70 h-3 w-3/6 rounded" />
    </div>
    <div className="bg-muted/60 mt-2 h-24 w-full max-w-lg rounded-xl" />
  </div>
);

/** The chat behind, dimmed; the dialog on top — centred, or a sheet from the bottom of a phone. */
export const Stage = ({ children, width = "max-w-sm" }: { children: React.ReactNode; width?: string }) => {
  const { screen } = useProto();
  if (screen === "phone") {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8">
        <div className="bg-background relative h-[812px] w-[390px] overflow-hidden rounded-[2.5rem] border shadow-xl">
          <ChatBehind />
          <div className="absolute inset-0 bg-black/40" />
          <div className="bg-popover animate-in slide-in-from-bottom-8 fade-in absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-8 duration-300">
            <div className="bg-muted-foreground/30 mx-auto mb-4 h-1 w-9 rounded-full" />
            {children}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <ChatBehind />
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={cn("bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in zoom-in-95 relative w-full rounded-2xl text-sm shadow-xl ring-1 duration-150", width)}>{children}</div>
      </div>
    </div>
  );
};

export const CloseButton = () => (
  <Button aria-label="Закрыть" className="absolute top-3 right-3" size="icon-sm" variant="ghost">
    <X />
  </Button>
);

export const Logo = ({ size = 40, className }: { size?: number; className?: string }) => {
  const server = useServer();
  return <BrandLogo className={className} label={server.title} logo={server.logo} size={size} />;
};

/** Why the answer asks for it — the model's words, marked as its. */
export const ReasonNote = ({ className }: { className?: string }) => {
  const { reason } = useProto();
  if (!reason) return null;
  return (
    <p className={cn("bg-muted/60 text-muted-foreground flex gap-2 rounded-lg px-3 py-2 text-[13px] leading-snug", className)}>
      <Sparkles className="mt-0.5 size-3.5 shrink-0" />
      <span>{REASON}</span>
    </p>
  );
};

/** Where the secret goes: to this person only, encrypted, checked at once. */
export const TrustLine = ({ className }: { className?: string }) => (
  <p className={cn("text-muted-foreground text-xs leading-snug", className)}>
    <Lock className="mr-1 inline size-3.5 -translate-y-px align-middle" />
    {useServer().auth === "basic" ? "Пароль" : useServer().auth === "token" ? "Токен" : "Ключ"} хранится в зашифрованном виде и используется только в ваших чатах
  </p>
);

const FILLED: Status[] = ["filled", "checking", "refused", "unreachable"];

/** The fields of the server's way in, in the state the knob sets; typing into an empty one works. */
export const Fields = ({ onSubmit }: { onSubmit: () => void }) => {
  const server = useServer();
  const { status } = useProto();
  const prefilled = FILLED.includes(status);
  const [login, setLogin] = useState("");
  const [secret, setSecret] = useState("");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setLogin(prefilled ? "ivanova" : "");
    setSecret(prefilled ? "Korova-2026" : "");
  }, [prefilled, server.auth]);
  const checking = status === "checking";
  const refused = status === "refused";
  const basic = server.auth === "basic";
  const label = basic ? "Пароль" : server.auth === "header" ? "Значение заголовка" : "Токен доступа";
  const ready = secret.trim() !== "" && (!basic || login.trim() !== "");
  const { setReady } = useProto();
  useEffect(() => setReady(ready), [ready, setReady]);
  return (
    <form
      className="flex flex-col gap-4"
      id="sign-in"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !checking) onSubmit();
      }}
    >
      {basic && (
        <Field>
          <FieldLabel htmlFor="login">Логин</FieldLabel>
          <Input autoComplete="off" autoFocus data-1p-ignore disabled={checking} id="login" onChange={(e) => setLogin(e.target.value)} value={login} />
        </Field>
      )}
      <Field data-invalid={refused}>
        <FieldLabel className="flex items-center gap-2" htmlFor="secret">
          {label}
          {server.headerName && <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-normal">{server.headerName}</code>}
        </FieldLabel>
        <InputGroup data-disabled={checking || undefined}>
          <SecretInput
            aria-invalid={refused}
            autoFocus={!basic}
            className={cn(shown && "[-webkit-text-security:none]")}
            disabled={checking}
            id="secret"
            onChange={(e) => setSecret(e.target.value)}
            value={secret}
          />
          {/* Shown only once there is something to show: an empty field has nothing to reveal. */}
          {secret && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton aria-label={shown ? "Скрыть" : "Показать"} onClick={() => setShown(!shown)} size="icon-xs">
                {shown ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {refused && <FieldError>{basic ? "Неверный логин или пароль" : "Сервер не принял — проверьте и вставьте ещё раз"}</FieldError>}
      </Field>
      {status === "unreachable" && <Unreachable />}
    </form>
  );
};

/** The server did not answer: not the user's fault — the fields stay, «Повторить» tries again. */
const Unreachable = () => {
  const server = useServer();
  return (
    <div className="bg-warning/10 text-warning-foreground flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] leading-snug">
      <CircleAlert className="text-warning mt-0.5 size-4 shrink-0" />
      <span className="text-foreground/80">«{server.title}» не отвечает — это не из-за данных. Попробуйте ещё раз чуть позже.</span>
    </div>
  );
};

/** The button: «Войти» for a login, «Подключить» for a key; while checking — «Проверяем…»; after a silent server — «Повторить». */
export const SubmitButton = ({ className }: { className?: string }) => {
  const server = useServer();
  const { status, ready } = useProto();
  const checking = status === "checking";
  const verb = server.auth === "basic" ? "Войти" : "Подключить";
  return (
    <Button className={className} disabled={checking || !ready} form="sign-in" type="submit">
      {checking && <Spinner />}
      {status === "unreachable" && <RotateCw />}
      {checking ? "Проверяем…" : status === "unreachable" ? "Повторить" : verb}
    </Button>
  );
};

/** Connected: what it gives, and that the answer goes on — then the dialog closes itself. */
export const Done = ({ className }: { className?: string }) => {
  const server = useServer();
  const { reason } = useProto();
  return (
    <div className={cn("animate-in fade-in zoom-in-95 flex flex-col items-center gap-3 py-4 text-center duration-200", className)}>
      <span className="relative">
        <Logo size={48} />
        <CircleCheck className="bg-popover text-success absolute -right-1.5 -bottom-1.5 size-5 rounded-full" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">Подключено</p>
        <p className="text-muted-foreground text-sm">{reason ? "Модель продолжает ответ" : `${server.toolCount} инструментов «${server.title}» теперь в чате`}</p>
      </div>
    </div>
  );
};

/** On a phone the buttons fill the width; the sheet's swipe closes it, so no «Отмена». */
export const usePhone = () => useProto().screen === "phone";
