"use client";

import { BrandMark } from "@/components/auth/brand-mark";
import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { CloseButton, Done, Fields, Logo, ReasonNote, Stage, SubmitButton, TrustLine, useFlow, usePhone, useServer } from "./parts";
import { ProtoParams, ProtoProvider, useProto } from "./state";

// Signing in to an MCP server from the chat (the user's own login and password, token or header's value). Today's
// dialog: «Подключение к Управление торговлей» — the name does not decline, nothing says what the service is or what
// the secret is for, the button is the only thing that looks like anything. Three ways: «Шапка» (the service's card
// on top, the secret's line at the bottom), «Вход» (a sign-in page of its own: logo, «Войдите в …», one wide
// button; chosen — under the title the admin's description, no model's reason), «Связка» (Metobe ↔ the service, what it gives the chat). The name always in «», never declined.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

/** «Отмена» and the action; a phone — one wide button, the sheet swipes away. */
const Actions = ({ className }: { className?: string }) => {
  const phone = usePhone();
  if (phone) return <SubmitButton className={cn("h-11 w-full text-base", className)} />;
  return (
    <div className={cn("flex justify-end gap-2", className)}>
      <Button variant="ghost">Отмена</Button>
      <SubmitButton />
    </div>
  );
};

/** «Шапка»: the service as a card — logo, name, what it is — then the fields, the secret's line by the buttons. */
const Header = () => {
  const server = useServer();
  const { status, submit } = useFlow();
  const phone = usePhone();
  return (
    <Stage>
      {!phone && <CloseButton />}
      {status === "done" ? (
        <Done className="p-6" />
      ) : (
        <>
          <div className={cn("flex flex-col gap-4", phone ? "pb-4" : "p-5 pb-4")}>
            <div className="flex items-center gap-3 pr-8">
              <Logo />
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{server.title}</h2>
                <p className="text-muted-foreground truncate text-[13px]">{server.description}</p>
              </div>
            </div>
            <ReasonNote />
            <Fields onSubmit={submit} />
          </div>
          <div className={cn("flex items-center gap-3", phone ? "flex-col-reverse items-stretch pt-2" : "bg-muted/40 rounded-b-2xl border-t px-5 py-3")}>
            <TrustLine className={cn(!phone && "mr-auto")} />
            <Actions />
          </div>
        </>
      )}
    </Stage>
  );
};

/** «Вход»: a sign-in page of its own — the logo in the middle, «Войдите в «…»», the fields, one wide button. */
const SignIn = () => {
  const server = useServer();
  const { status, submit } = useFlow();
  const phone = usePhone();
  return (
    <Stage width="max-w-[22rem]">
      {!phone && <CloseButton />}
      {status === "done" ? (
        <Done className="p-6" />
      ) : (
        <div className={cn("flex flex-col gap-5", !phone && "p-6 pt-8")}>
          <div className="flex flex-col items-center gap-3 text-center">
            <Logo size={48} />
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-balance">
                {server.auth === "basic" ? "Войдите в" : "Подключите"} «{server.title}»
              </h2>
              <p className="text-muted-foreground text-[13px] text-balance">{server.description}</p>
            </div>
          </div>
          <ReasonNote />
          <Fields onSubmit={submit} />
          <div className="flex flex-col gap-3">
            <SubmitButton className={cn("w-full", phone && "h-11 text-base")} />
            <TrustLine className="justify-center text-center" />
          </div>
        </div>
      )}
    </Stage>
  );
};

/** «Связка»: Metobe and the service joined, what it gives the chat — then the fields. */
const Link = () => {
  const server = useServer();
  const { status, submit } = useFlow();
  const { reason } = useProto();
  const phone = usePhone();
  const done = status === "done";
  return (
    <Stage width="max-w-[24rem]">
      {!phone && <CloseButton />}
      <div className={cn("flex flex-col gap-5", !phone && "p-6")}>
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <div className="flex items-center gap-2">
            <BrandMark className="size-11 rounded-xl text-base" />
            <span className="flex items-center gap-1" aria-hidden>
              <span className="bg-border h-px w-5" />
              <span className={cn("grid size-5 place-items-center rounded-full border transition-colors duration-300", done ? "bg-success border-success text-white" : "bg-background text-muted-foreground")}>
                {done ? <Check className="size-3" strokeWidth={3} /> : <span className="bg-muted-foreground/50 size-1.5 rounded-full" />}
              </span>
              <span className="bg-border h-px w-5" />
            </span>
            <Logo size={44} className="rounded-xl" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-balance">{done ? "Подключено" : `Подключить «${server.title}»`}</h2>
            <p className="text-muted-foreground text-[13px] text-balance">{done ? (reason ? "Модель продолжает ответ" : `${server.toolCount} инструментов теперь в чате`) : server.description}</p>
            {!done && <span className="bg-muted text-muted-foreground mx-auto mt-1 rounded-full px-2.5 py-0.5 text-xs">{server.toolCount} инструментов для модели</span>}
          </div>
        </div>
        {!done && (
          <>
            <ReasonNote />
            <Fields onSubmit={submit} />
            <div className="flex flex-col gap-3">
              <SubmitButton className={cn("w-full", phone && "h-11 text-base")} />
              <TrustLine className="justify-center text-center" />
            </div>
          </>
        )}
      </div>
    </Stage>
  );
};

const McpSignInPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Header /></Mounted>, name: "Шапка" },
        { Component: () => <Mounted><SignIn /></Mounted>, name: "Вход" },
        { Component: () => <Mounted><Link /></Mounted>, name: "Связка" },
      ]}
    />
  </ProtoProvider>
);

export default McpSignInPrototypePage;
