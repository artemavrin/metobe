"use client";

import { Button } from "@metobe/ui/components/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@metobe/ui/components/empty";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { CircleAlert, Languages, Palette, Plug } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";
import { SettingsPageFrame } from "@/components/settings/settings-shell";
import type { SettingsSectionId } from "@/lib/settings-nav";

import { AppearancePage } from "../providers/v3/appearance-page";
import { RegionPage } from "../providers/v3/region-page";
import { secretLabel, type Server, toolsWord } from "./data";
import {
  CredentialFields,
  CredentialValue,
  DisconnectDialog,
  Dot,
  EditableRow,
  Mark,
  STANDING,
  SignInButton,
  useDraft,
  useUsed,
} from "./parts";
import { LeaveSection, OAuthDialog, useOAuthWindow } from "./oauth-flow";
import { AdminStub, type DrillEntry, ProtoShell } from "./shell";
import { type Mine, useMine, useProto } from "./state";

// «Погружение»: «Подключения» are a list section of the user's settings, like the admin's lists — the sidebar drills
// into the servers, each opens its own page: status, the account (the settings' row editor), when it was used, leave.

/** Nothing to connect: the admin has not added a server with personal credentials. */
export const NothingYet = ({ onCatalog }: { onCatalog: () => void }) => {
  const { role } = useProto();
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Plug />
        </EmptyMedia>
        <EmptyTitle>Подключать пока нечего</EmptyTitle>
        <EmptyDescription>
          {role === "admin"
            ? "Добавьте сервер в каталог и выберите, что учётки у каждого свои, — он появится здесь у всех, кому доступен."
            : "Когда администратор добавит сервер с личными учётками, он появится здесь."}
        </EmptyDescription>
      </EmptyHeader>
      {role === "admin" && (
        <EmptyContent>
          <Button onClick={onCatalog} variant="outline">
            Открыть MCP-серверы
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
};

/** `v2` — «Погружение · 2»: leaving in its own section at the end, OAuth in the provider's window with a modal. */
const ServerPage = ({ server, mine, v2 = false }: { server: Server; mine: Mine; v2?: boolean }) => {
  const format = useFormatter();
  const used = useUsed();
  const c = mine.connections[server.id];
  const st = mine.standing(server);
  const draft = useDraft(c);
  // A refused key opens its editor at once: the fix is the only thing to do here.
  const [editing, setEditing] = useState(st === "error");
  const [leaving, setLeaving] = useState(false);
  const busy = mine.busy === server.id;
  const oauth = useOAuthWindow({ onDone: mine.markSignedIn, onFallback: mine.signIn });
  // The first round signs in with a redirect (the pause stands for it); the second — in the provider's window.
  const signIn = () => (v2 ? oauth.start(server) : mine.signIn(server));
  const save = async () => {
    const problem = await mine.connect(server, { login: draft.login, secret: draft.secret });
    if (!problem) draft.setSecret("");
    return problem;
  };
  const editor = <CredentialFields c={c} draft={draft} layout="inline" server={server} />;
  const secretRow = server.auth === "basic" ? "Вход" : secretLabel(server);

  return (
    <SettingsPageFrame>
      <header className="flex items-center gap-3">
        <Mark server={server} size={48} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{server.title}</h1>
          <p className="text-muted-foreground flex items-baseline gap-1.5">
            <Dot className="shrink-0 translate-y-[-1px]" standing={st} />
            <span>{[STANDING[st].label, c && st === "active" ? used(c) : null, toolsWord(server.toolCount)].filter(Boolean).join(" · ")}</span>
          </p>
        </div>
      </header>

      {(st === "needs_reauth" || st === "error") && (
        <Alert variant={st === "error" ? "destructive" : "warning"}>
          <CircleAlert />
          <AlertTitle>{c?.lastError}</AlertTitle>
          <AlertDescription>
            {st === "error" ? "Пока ключ не заменят, тулы сервера в чате не работают." : `Пока вы не войдёте, тулы ${server.title} в чате не работают.`}
          </AlertDescription>
          {server.auth === "oauth" && (
            <AlertAction>
              <SignInButton again busy={busy} onClick={signIn} server={server} size="sm" />
            </AlertAction>
          )}
        </Alert>
      )}

      {server.mode === "shared" && (
        <>
          {server.adminOnly && (
            <Alert>
              <CircleAlert />
              <AlertTitle>Сервер ждёт администратора</AlertTitle>
              <AlertDescription>Общая учётка не работает. Тулы появятся сами, когда её поправят.</AlertDescription>
            </Alert>
          )}
          <Section title="Учётная запись">
            <Rows>
              <Row hint="Её задаёт администратор — вам ничего вводить не нужно" label="Общая для организации" />
            </Rows>
          </Section>
        </>
      )}

      {server.mode === "per_user" && c && (
        <Section title="Ваша учётная запись">
          <Rows>
            {server.auth === "oauth" ? (
              <Row
                action={
                  st === "active" && <SignInButton again busy={busy} onClick={signIn} server={server} size="sm" variant="outline" />
                }
                hint={v2 ? `В окне ${server.title}` : `Через страницу ${server.title}`}
                label="Вход"
              >
                <span className="text-sm">{st === "active" ? "Выполнен" : "Истёк"}</span>
              </Row>
            ) : (
              <EditableRow
                editor={editor}
                label={secretRow}
                onOpenChange={setEditing}
                onSave={save}
                open={editing}
                value={<CredentialValue c={c} server={server} />}
              />
            )}
            <Row label="Подключено">
              <span className="text-sm">{format.dateTime(c.createdAt, { dateStyle: "long" })}</span>
            </Row>
            {!v2 && (
              <Row
                action={
                  <Button className="text-destructive hover:text-destructive" onClick={() => setLeaving(true)} size="sm" variant="ghost">
                    Отключить
                  </Button>
                }
                hint="Учётка удалится, тулы сервера пропадут из ваших чатов"
                label="Отключиться"
              />
            )}
          </Rows>
        </Section>
      )}

      {server.mode === "per_user" && !c && (
        <Section title="Подключение">
          <Rows>
            {server.auth === "oauth" ? (
              <Row
                action={<SignInButton busy={busy} onClick={signIn} server={server} size="sm" />}
                hint={v2 ? `Откроется окно ${server.title}: войдите там, это окно подождёт` : "Откроется страница сервиса, после входа вернётесь сюда"}
                label={`Вход через ${server.title}`}
              />
            ) : (
              <EditableRow
                action="Подключить"
                editor={editor}
                label={secretRow}
                onOpenChange={setEditing}
                onSave={save}
                open={editing}
                primary="Проверить и подключить"
                value={<span className="text-muted-foreground text-sm">не задан</span>}
              />
            )}
          </Rows>
          <p className="text-muted-foreground text-xs">После подключения упомяните {server.title} в чате через @ — модель получит его тулы.</p>
        </Section>
      )}

      {v2 && server.mode === "per_user" && c && (
        <LeaveSection
          onLeave={() => {
            mine.disconnect(server);
            setEditing(false);
          }}
          server={server}
        />
      )}

      <DisconnectDialog
        onConfirm={() => {
          mine.disconnect(server);
          setEditing(false);
        }}
        onOpenChange={setLeaving}
        open={leaving}
        server={server}
      />
      {v2 && <OAuthDialog flow={oauth} />}
    </SettingsPageFrame>
  );
};

export const Drill = ({ v2 = false }: { v2?: boolean } = {}) => {
  const t = useTranslations("settings");
  const mine = useMine();
  const used = useUsed();
  const [section, setSection] = useState("connections");
  const perUser = mine.servers.filter((s) => s.mode === "per_user");
  const org = mine.servers.filter((s) => s.mode === "shared");
  const [selected, setSelected] = useState<string | undefined>(perUser[0]?.id);
  const current = mine.servers.find((s) => s.id === selected) ?? mine.servers[0];
  const connected = perUser.filter((s) => mine.standing(s) === "active").length;

  const entries: DrillEntry[] = [...perUser, ...org].map((s) => {
    const st = mine.standing(s);
    const c = mine.connections[s.id];
    return {
      dot: STANDING[st].dot,
      group: s.mode === "shared" ? "От организации" : undefined,
      id: s.id,
      media: <Mark server={s} size={28} />,
      sub: st === "active" && c ? used(c) : STANDING[st].label,
      title: s.title,
    };
  });

  return (
    <ProtoShell
      active={section}
      drill={
        section === "connections"
          ? {
              activeId: current?.id,
              entries,
              meta: perUser.length ? `${connected} из ${perUser.length} подключены` : "Пока пусто",
              onSelect: setSelected,
              title: "Подключения",
            }
          : undefined
      }
      onOpen={setSection}
      personal={[
        { icon: Plug, id: "connections", kind: "list", label: "Подключения" },
        { icon: Languages, id: "region", kind: "screen", label: t("sections.region.label") },
        { icon: Palette, id: "appearance", kind: "screen", label: t("sections.appearance.label") },
      ]}
    >
      {section === "connections" &&
        (current ? (
          <ServerPage key={current.id} mine={mine} server={current} v2={v2} />
        ) : (
          <SettingsPageFrame>
            <NothingYet onCatalog={() => setSection("admin:connections")} />
          </SettingsPageFrame>
        ))}
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
