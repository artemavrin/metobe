"use client";

import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { Ellipsis, Languages, Palette, Plug } from "lucide-react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";

import { Rows, Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";
import type { SettingsSectionId } from "@/lib/settings-nav";

import { AppearancePage } from "../providers/v3/appearance-page";
import { RegionPage } from "../providers/v3/region-page";
import { AUTH_LABEL, type Server, toolsWord } from "./data";
import { CredentialFields, credentialText, DisconnectDialog, Mark, SignInButton, STANDING, useDraft, useUsed } from "./parts";
import { AdminStub, ProtoShell } from "./shell";
import { type Mine, useMine } from "./state";
import { NothingYet } from "./v-drill";

// «Лента»: one screen, the servers grouped by what they need from you — what is broken first, then what works, what
// you could connect, what the organization gives. Every fix and every form opens right in its row; a server that
// changes group travels there, so you see where it went.

/** Moving on screen: a strong ease-in-out, short. */
const MOVE = { duration: 0.28, ease: [0.77, 0, 0.175, 1] as const };

const FeedRow = ({ server, mine, onLeave }: { server: Server; mine: Mine; onLeave: (s: Server) => void }) => {
  const used = useUsed();
  const st = mine.standing(server);
  const c = mine.connections[server.id];
  const draft = useDraft(c);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = mine.busy === server.id;
  const submit = () =>
    start(async () => {
      setError(null);
      const problem = await mine.connect(server, { login: draft.login, secret: draft.secret });
      if (problem) setError(problem);
      else {
        draft.setSecret("");
        setOpen(false);
      }
    });

  let line: ReactNode;
  if (st === "active" && c) line = `${credentialText(server, c)} · ${used(c)}`;
  else if (st === "needs_reauth" || st === "error") line = <span className={st === "error" ? "text-destructive" : "text-warning-foreground dark:text-warning"}>{c?.lastError}</span>;
  else if (st === "none") line = `${AUTH_LABEL[server.auth]} · ${toolsWord(server.toolCount)}`;
  else if (st === "org") line = `Учётка организации · ${toolsWord(server.toolCount)}`;
  else line = "Ждёт администратора: общая учётка не работает";

  let action: ReactNode = null;
  if (st === "needs_reauth") action = <SignInButton again busy={busy} onClick={() => mine.signIn(server)} server={server} size="sm" />;
  else if (st === "error" && !open) action = <Button onClick={() => setOpen(true)} size="sm">Заменить ключ</Button>;
  else if (st === "none" && !open)
    action =
      server.auth === "oauth" ? (
        <Button aria-disabled={busy} onClick={() => !busy && mine.signIn(server)} size="sm" variant="outline">
          {busy && <Spinner />}
          {busy ? `Открываем ${server.title}…` : "Подключить"}
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          Подключить
        </Button>
      );
  else if (st === "active")
    action = (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">{toolsWord(server.toolCount)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label={`Действия: ${server.title}`} size="icon-sm" variant="ghost" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-44">
            {server.auth === "oauth" ? (
              <DropdownMenuItem onClick={() => mine.signIn(server)}>Войти заново</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setOpen(true)}>{server.auth === "basic" ? "Сменить логин или пароль" : "Заменить ключ"}</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onLeave(server)} variant="destructive">
              Отключить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );

  return (
    <motion.div layout="position" layoutId={server.id} transition={MOVE}>
      <div className="flex min-h-14 items-center gap-3 px-4 py-3">
        <Mark server={server} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{server.title}</span>
          {/* A problem may take two lines: cut mid-word it would not say what to do. */}
          <span className={cn("text-muted-foreground text-xs", st === "needs_reauth" || st === "error" ? "line-clamp-2" : "truncate", busy && "shimmer")}>
            {busy ? "Проверяем…" : line}
          </span>
        </div>
        {action}
      </div>
      {open && (
        <form
          className="animate-in fade-in fill-mode-both flex flex-col gap-2 px-4 pb-4 duration-150"
          noValidate
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) submit();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 basis-full flex-wrap gap-2 sm:flex-1 sm:basis-auto">
              <CredentialFields c={c} draft={draft} layout="inline" server={server} />
            </div>
            {!pending && (
              <Button onClick={() => setOpen(false)} type="button" variant="ghost">
                Отмена
              </Button>
            )}
            <Button aria-disabled={pending} type="submit">
              {pending && <Spinner />}
              {c ? "Сохранить" : "Проверить и подключить"}
            </Button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </form>
      )}
    </motion.div>
  );
};

const Group = ({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) => (
  <motion.div layout="position" transition={MOVE}>
    <Section meta={meta} title={title}>
      <Rows>{children}</Rows>
    </Section>
  </motion.div>
);

export const Feed = () => {
  const t = useTranslations("settings");
  const mine = useMine();
  const [section, setSection] = useState("connections");
  // The server stays while the dialog closes, so its title does not blank out mid-animation.
  const [leaving, setLeaving] = useState<Server | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const perUser = mine.servers.filter((s) => s.mode === "per_user");
  const attention = perUser.filter((s) => ["needs_reauth", "error"].includes(mine.standing(s)));
  const connected = perUser.filter((s) => mine.standing(s) === "active");
  const available = perUser.filter((s) => mine.standing(s) === "none");
  const org = mine.servers.filter((s) => s.mode === "shared");
  const row = (s: Server) => (
    <FeedRow
      key={s.id}
      mine={mine}
      onLeave={(x) => {
        setLeaving(x);
        setLeaveOpen(true);
      }}
      server={s}
    />
  );

  return (
    <ProtoShell
      active={section}
      onOpen={setSection}
      personal={[
        { badge: attention.length || undefined, icon: Plug, id: "connections", kind: "screen", label: "Подключения" },
        { icon: Languages, id: "region", kind: "screen", label: t("sections.region.label") },
        { icon: Palette, id: "appearance", kind: "screen", label: t("sections.appearance.label") },
      ]}
    >
      {section === "connections" && (
        <SettingsPageFrame>
          <SettingsHeader
            description="Ваши учётки к серверам с тулами. Модель зовёт их, когда вы упоминаете сервер в чате через @. Пароли не показываются даже частично."
            title="Подключения"
          />
          {mine.servers.length === 0 ? (
            <NothingYet onCatalog={() => setSection("admin:connections")} />
          ) : (
            <MotionConfig reducedMotion="user">
              <LayoutGroup>
                {attention.length > 0 && <Group title="Требуют внимания">{attention.map(row)}</Group>}
                {connected.length > 0 && (
                  <Group meta={String(connected.length)} title="Подключены">
                    {connected.map(row)}
                  </Group>
                )}
                {available.length > 0 && <Group title="Можно подключить">{available.map(row)}</Group>}
                {org.length > 0 && <Group title="От организации">{org.map(row)}</Group>}
              </LayoutGroup>
            </MotionConfig>
          )}
          <DisconnectDialog
            onConfirm={() => leaving && mine.disconnect(leaving)}
            onOpenChange={setLeaveOpen}
            open={leaveOpen}
            server={leaving}
          />
        </SettingsPageFrame>
      )}
      {section === "region" && (
        <SettingsPageFrame>
          <RegionPage />
        </SettingsPageFrame>
      )}
      {section === "appearance" && (
        <SettingsPageFrame>
          <AppearancePage />
        </SettingsPageFrame>
      )}
      {section.startsWith("admin:") && <AdminStub id={section.slice(6) as SettingsSectionId} />}
    </ProtoShell>
  );
};
