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
import { Badge } from "@metobe/ui/components/reui/badge";
import { Spinner } from "@metobe/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { CircleUserRound } from "lucide-react";
import { useState, useTransition } from "react";

import { SettingsPageFrame } from "@/components/settings/settings-shell";
import type { SettingsSectionId } from "@/lib/settings-nav";

import { AppearancePage } from "../providers/v3/appearance-page";
import { RegionPage } from "../providers/v3/region-page";
import { AUTH_LABEL, PERSON, type Server, toolsWord } from "./data";
import { CredentialFields, credentialText, Dot, Mark, SignInButton, STANDING, useDraft, useUsed } from "./parts";
import { AccountRow, AdminStub, ProtoShell } from "./shell";
import { type Mine, useMine, useProto } from "./state";
import { NothingYet } from "./v-drill";

// «Аккаунт»: one way into everything that is yours — the account row or «Аккаунт» in the menu opens a page with who you
// are and tabs: connections, language and region, appearance. Servers are cards; a card opens the same dialog the
// chat opens when you connect a server there.

const initials = (name: string) =>
  name
    .split(/\s+/u)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const ServerCard = ({ server, mine, onOpen }: { server: Server; mine: Mine; onOpen?: () => void }) => {
  const used = useUsed();
  const st = mine.standing(server);
  const c = mine.connections[server.id];
  let line: string;
  if (st === "active" && c) line = `${credentialText(server, c)} · ${used(c)}`;
  else if ((st === "needs_reauth" || st === "error") && c?.lastError) line = c.lastError;
  else if (st === "none") line = `Подключите — и зовите его тулы в чате через @`;
  else if (st === "org") line = "Учётку задаёт администратор, вводить ничего не нужно";
  else line = "Общая учётка не работает — её поправит администратор";
  const body = (
    <>
      <div className="flex items-start gap-3">
        <Mark server={server} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{server.title}</span>
          <span className="text-muted-foreground truncate text-xs">
            {AUTH_LABEL[server.auth]} · {toolsWord(server.toolCount)}
          </span>
        </div>
        <Badge size="sm" variant={STANDING[st].badge}>
          {STANDING[st].label}
        </Badge>
      </div>
      <p className={cn("text-xs", st === "error" ? "text-destructive" : st === "needs_reauth" ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
        {line}
      </p>
    </>
  );
  if (!onOpen) return <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">{body}</div>;
  return (
    <button
      className="flex flex-col gap-3 rounded-lg border p-4 text-left transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted/40 active:scale-[0.99]"
      onClick={onOpen}
      type="button"
    >
      {body}
    </button>
  );
};

/** The connect-and-manage dialog: the fields (or the provider's sign-in), what is saved, and leaving. */
const ManageDialog = ({ server, mine, open, onOpenChange }: { server: Server | null; mine: Mine; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const used = useUsed();
  const c = server ? mine.connections[server.id] : undefined;
  const st = server ? mine.standing(server) : "none";
  const draft = useDraft(c);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const busy = server !== null && mine.busy === server.id;
  if (!server) return null;
  const submit = () =>
    start(async () => {
      setError(null);
      const problem = await mine.connect(server, { login: draft.login, secret: draft.secret });
      if (problem) setError(problem);
      else onOpenChange(false);
    });
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Mark server={server} size={40} />
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>{server.title}</DialogTitle>
              <DialogDescription className="flex items-baseline gap-1.5">
                <Dot className="shrink-0 translate-y-[-1px]" standing={st} />
                <span>{[STANDING[st].label, c && st === "active" ? used(c) : null].filter(Boolean).join(" · ")}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {c?.lastError && st !== "active" && <p className={cn("text-sm", st === "error" ? "text-destructive" : "text-warning-foreground dark:text-warning")}>{c.lastError}</p>}
        {server.auth === "oauth" ? (
          <p className="text-muted-foreground text-sm">
            {c ? "Вход выполнен через страницу" : "Откроется страница"} {server.title}. После входа вернётесь сюда.
          </p>
        ) : (
          <form
            id="manage-connection"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!pending) submit();
            }}
          >
            <CredentialFields c={c} draft={draft} error={error} layout="stacked" server={server} />
          </form>
        )}
        <DialogFooter className="sm:justify-between">
          {c ? (
            confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">Точно отключить?</span>
                <Button
                  onClick={() => {
                    mine.disconnect(server);
                    onOpenChange(false);
                  }}
                  size="sm"
                  variant="destructive"
                >
                  Отключить
                </Button>
                <Button onClick={() => setConfirming(false)} size="sm" variant="ghost">
                  Нет
                </Button>
              </div>
            ) : (
              <Button className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)} variant="ghost">
                Отключить
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button variant="ghost" />}>Закрыть</DialogClose>
            {server.auth === "oauth" ? (
              <SignInButton
                again={Boolean(c)}
                busy={busy}
                onClick={async () => {
                  await mine.signIn(server);
                  onOpenChange(false);
                }}
                server={server}
              />
            ) : (
              <Button aria-disabled={pending} form="manage-connection" type="submit">
                {pending && <Spinner />}
                {c ? "Сохранить" : "Проверить и подключить"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const Hub = () => {
  const mine = useMine();
  const { role } = useProto();
  const [section, setSection] = useState("account");
  const [tab, setTab] = useState("connections");
  const [managing, setManaging] = useState<Server | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  // Every opening starts clean: no half-typed secret, no «Точно отключить?» left from last time.
  const [openings, setOpenings] = useState(0);
  const perUser = mine.servers.filter((s) => s.mode === "per_user");
  const org = mine.servers.filter((s) => s.mode === "shared");
  const attention = perUser.filter((s) => ["needs_reauth", "error"].includes(mine.standing(s))).length;
  const manage = (s: Server) => {
    setManaging(s);
    setOpenings((n) => n + 1);
    setManageOpen(true);
  };

  return (
    <ProtoShell
      active={section}
      footer={<AccountRow active={section === "account"} onClick={() => setSection("account")} />}
      onOpen={setSection}
      personal={[{ badge: attention || undefined, icon: CircleUserRound, id: "account", kind: "screen", label: "Аккаунт" }]}
    >
      {section === "account" && (
        <SettingsPageFrame>
          <header className="flex items-center gap-4">
            <span className="bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-medium">
              {initials(PERSON.name)}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">{PERSON.name}</h1>
              <p className="text-muted-foreground truncate">
                {PERSON.email} · {role === "admin" ? "Администратор" : "Пользователь"}
              </p>
            </div>
          </header>
          <Tabs onValueChange={(v) => setTab(String(v))} value={tab}>
            <TabsList className="border-b w-full justify-start" variant="line">
              <TabsTrigger value="connections">
                Подключения
                {attention > 0 && (
                  <Badge className="ml-1" size="xs" variant="warning-light">
                    {attention}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="region">Язык и регион</TabsTrigger>
              <TabsTrigger value="appearance">Оформление</TabsTrigger>
            </TabsList>
            <TabsContent className="flex flex-col gap-6 pt-4" value="connections">
              {mine.servers.length === 0 ? (
                <NothingYet onCatalog={() => setSection("admin:connections")} />
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {perUser.map((s) => (
                      <ServerCard key={s.id} mine={mine} onOpen={() => manage(s)} server={s} />
                    ))}
                  </div>
                  {org.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h2 className="text-sm font-semibold">От организации</h2>
                      <div className="grid gap-3 md:grid-cols-2">
                        {org.map((s) => (
                          <ServerCard key={s.id} mine={mine} server={s} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
            <TabsContent className="flex flex-col gap-6 pt-4 [&>header]:hidden" value="region">
              <RegionPage />
            </TabsContent>
            <TabsContent className="flex flex-col gap-6 pt-4 [&>header]:hidden" value="appearance">
              <AppearancePage />
            </TabsContent>
          </Tabs>
          <ManageDialog key={openings} mine={mine} onOpenChange={setManageOpen} open={manageOpen} server={managing} />
        </SettingsPageFrame>
      )}
      {section.startsWith("admin:") && <AdminStub id={section.slice(6) as SettingsSectionId} />}
    </ProtoShell>
  );
};
