"use client";

import {
  catalogAccessModes,
  credentialModes,
  mcpAuthKinds,
  mcpTransports,
  toolApprovals,
} from "@metobe/contracts/catalog";
import type { ToolApproval } from "@metobe/contracts/catalog";
import type { CatalogItem } from "@metobe/core/catalog";
import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import { Input } from "@metobe/ui/components/input";
import { InputGroup } from "@metobe/ui/components/input-group";
import { SecretInput } from "@metobe/ui/components/secret-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { LogIn, LogOut, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Row, Rows, Section } from "@/components/settings/rows";

import {
  check,
  remove,
  rename,
  setAccess,
  setApprovals,
  setLogo,
  setEnabled,
  setMode,
  setServer,
  signOut,
  setToken,
} from "./actions";

const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  spellCheck: false,
} as const;

type PillState = "ok" | "auth" | "error" | "unchecked" | "checking";

const DOT: Record<PillState, string> = {
  auth: "bg-amber-500",
  checking: "bg-muted-foreground animate-pulse",
  error: "bg-destructive",
  ok: "bg-emerald-500",
  unchecked: "bg-muted-foreground/40",
};

/** Who signs in and how: shared or each user's own, the auth kind, the token or header, or the OAuth sign-in. */
const AccessSection = ({
  item,
  hint,
  oauthFailed,
  checking,
  onCheck,
}: {
  item: CatalogItem;
  hint: string | null;
  oauthFailed: boolean;
  checking: boolean;
  onCheck: (signIn?: boolean) => void;
}) => {
  const t = useTranslations("connections.detail");
  const ta = useTranslations("connections.auth");
  const [headerName, setHeaderName] = useState(item.config.headerName ?? "");
  const [username, setUsername] = useState(item.config.username ?? "");
  const [secret, setSecret] = useState("");
  const [, startChange] = useTransition();
  const { auth } = item.config;
  const runCheck = onCheck;
  const secretLabel = {
    basic: t("password"),
    bearer: t("token"),
    header: t("headerValue"),
  }[auth === "basic" || auth === "header" ? auth : "bearer"];
  return (
    <Section title={t("authSection")}>
      <Rows>
        <Row hint={t(`modeHints.${item.credentialMode}`)} label={t("mode")}>
          <Select
            onValueChange={(v) =>
              startChange(() => setMode(item.id, String(v)))
            }
            value={item.credentialMode}
          >
            <SelectTrigger className="w-full md:w-64">
              <SelectValue>{t(`modes.${item.credentialMode}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {credentialModes.map((x) => (
                <SelectItem key={x} value={x}>
                  {t(`modes.${x}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label={t("authKind")}>
          <Select
            onValueChange={(v) =>
              startChange(async () => {
                await setServer(item.id, {
                  auth: String(v),
                  ...(v === "header" && !item.config.headerName
                    ? { headerName: "X-API-Key" }
                    : {}),
                });
              })
            }
            value={auth}
          >
            <SelectTrigger className="w-full md:w-48">
              <SelectValue>{ta(auth)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {mcpAuthKinds.map((x) => (
                <SelectItem key={x} value={x}>
                  {ta(x)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {auth === "header" && (
          <Row label={t("headerName")}>
            <Input
              {...NO_AUTOFILL}
              className="w-full font-mono md:w-60"
              onBlur={() => {
                if (
                  headerName.trim() &&
                  headerName.trim() !== item.config.headerName
                ) {
                  startChange(async () => {
                    await setServer(item.id, {
                      headerName: headerName.trim(),
                    });
                  });
                }
              }}
              onChange={(e) => setHeaderName(e.target.value)}
              value={headerName}
            />
          </Row>
        )}
        {auth === "basic" && (
          <Row label={t("username")}>
            <Input
              {...NO_AUTOFILL}
              aria-label={t("username")}
              className="w-full font-mono md:w-60"
              onBlur={() => {
                if (username.trim() !== (item.config.username ?? "")) {
                  startChange(async () => {
                    await setServer(item.id, { username: username.trim() });
                  });
                }
              }}
              onChange={(e) => setUsername(e.target.value)}
              value={username}
            />
          </Row>
        )}
        {(auth === "bearer" || auth === "header" || auth === "basic") && (
          <Row
            hint={hint ? t("saved", { hint }) : undefined}
            label={secretLabel}
          >
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (secret.trim()) {
                  startChange(async () => {
                    await setToken(item.id, secret);
                    setSecret("");
                    runCheck();
                  });
                }
              }}
            >
              <InputGroup className="w-full md:w-72">
                <SecretInput
                  aria-label={secretLabel}
                  onChange={(e) => setSecret(e.target.value)}
                  value={secret}
                />
              </InputGroup>
              <Button
                disabled={!secret.trim()}
                size="sm"
                type="submit"
                variant="outline"
              >
                {t("save")}
              </Button>
            </form>
          </Row>
        )}
        {auth === "oauth" && (
          <Row
            hint={oauthFailed ? t("oauthFailed") : t("oauthHint")}
            label={t("oauth")}
          >
            {item.health?.state === "ok" ? (
              <div className="flex items-center gap-3">
                <span className="text-sm">{t("signedIn")}</span>
                <Button
                  onClick={() => startChange(() => signOut(item.id))}
                  size="sm"
                  variant="outline"
                >
                  <LogOut />
                  {t("signOut")}
                </Button>
              </div>
            ) : (
              <Button
                disabled={checking}
                onClick={() => runCheck(true)}
                size="sm"
                variant="outline"
              >
                <LogIn />
                {t("signIn")}
              </Button>
            )}
          </Row>
        )}
      </Rows>
    </Section>
  );
};

const TOOLS_PAGE = 20;

/**
 * The tools the server gave at the last check, each with its policy: auto, ask first, or never. A server may have
 * dozens: a search narrows them, one choice sets every found tool at once, and they come twenty at a time.
 */
const ToolsSection = ({ item }: { item: CatalogItem }) => {
  const t = useTranslations("connections.detail");
  const [, startChange] = useTransition();
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(TOOLS_PAGE);
  const [policy, setOptimisticPolicy] = useOptimistic(
    item.approvalPolicy,
    (current, change: Record<string, ToolApproval>) => ({
      ...current,
      ...change,
    })
  );
  const q = query.trim().toLowerCase();
  const found = q
    ? item.tools.filter((tool) =>
        [tool.name, tool.title, tool.description].some((x) =>
          x?.toLowerCase().includes(q)
        )
      )
    : item.tools;
  const apply = (names: string[], approval: ToolApproval) =>
    startChange(async () => {
      setOptimisticPolicy(Object.fromEntries(names.map((n) => [n, approval])));
      await setApprovals(item.id, names, approval);
    });
  return (
    <Section
      meta={item.tools.length > 0 ? item.tools.length : undefined}
      title={t("tools")}
    >
      {item.tools.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("toolsEmpty")}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">{t("toolsHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              {...NO_AUTOFILL}
              aria-label={t("toolsSearch")}
              className="w-full md:w-72"
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(TOOLS_PAGE);
              }}
              placeholder={t("toolsSearch")}
              value={query}
            />
            {found.length > 0 && (
              <Select
                onValueChange={(v: ToolApproval | null) => {
                  if (v) {
                    apply(
                      found.map((x) => x.name),
                      v
                    );
                  }
                }}
                value={null}
              >
                <SelectTrigger className="w-full md:w-56">
                  <SelectValue>
                    {t("toolsBulk", { count: found.length })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {toolApprovals.map((x) => (
                    <SelectItem key={x} value={x}>
                      {t(`approvals.${x}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {found.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("toolsNone")}</p>
          ) : (
            <Rows>
              {found.slice(0, shown).map((tool) => {
                const approval = policy[tool.name] ?? "auto";
                const tags = [
                  tool.readOnly ? t("readOnly") : null,
                  tool.destructive ? t("destructive") : null,
                ].filter(Boolean);
                return (
                  <Row
                    hint={[tool.description, tags.join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                    key={tool.name}
                    label={tool.title ?? tool.name}
                  >
                    <Select
                      onValueChange={(v) =>
                        apply([tool.name], v as ToolApproval)
                      }
                      value={approval}
                    >
                      <SelectTrigger className="w-full md:w-36">
                        <SelectValue>{t(`approvals.${approval}`)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {toolApprovals.map((x) => (
                          <SelectItem key={x} value={x}>
                            {t(`approvals.${x}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Row>
                );
              })}
            </Rows>
          )}
          {found.length > shown && (
            <Button
              className="w-fit"
              onClick={() => setShown((n) => n + TOOLS_PAGE)}
              size="sm"
              variant="outline"
            >
              {t("toolsMore", {
                count: Math.min(TOOLS_PAGE, found.length - shown),
              })}
            </Button>
          )}
        </>
      )}
    </Section>
  );
};

/** Who gets the server's tools in chat: everyone, or the users picked — with a search when there are many. */
const UsersSection = ({
  item,
  picked,
  users,
}: {
  item: CatalogItem;
  picked: string[];
  users: { id: string; name: string; email: string }[];
}) => {
  const t = useTranslations("connections.detail");
  const [, startChange] = useTransition();
  const [query, setQuery] = useState("");
  const [state, setOptimisticState] = useOptimistic({
    access: item.access,
    picked: new Set(picked),
  });
  const save = (access: string, next: Set<string>) =>
    startChange(async () => {
      setOptimisticState({
        access: access as typeof item.access,
        picked: next,
      });
      await setAccess(item.id, access, [...next]);
    });
  const q = query.trim().toLowerCase();
  const found = q
    ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q))
    : users;
  return (
    <Section title={t("access")}>
      <Rows>
        <Row
          hint={t(`accessHints.${state.access}`, {
            count: state.picked.size,
            total: users.length,
          })}
          label={t("accessMode")}
        >
          <Select
            onValueChange={(v) => save(String(v), state.picked)}
            value={state.access}
          >
            <SelectTrigger className="w-full md:w-64">
              <SelectValue>{t(`accessModes.${state.access}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {catalogAccessModes.map((x) => (
                <SelectItem key={x} value={x}>
                  {t(`accessModes.${x}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Rows>
      {state.access === "selected" && (
        <>
          {users.length > 8 && (
            <Input
              {...NO_AUTOFILL}
              aria-label={t("usersSearch")}
              className="w-full md:w-72"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("usersSearch")}
              value={query}
            />
          )}
          <Rows>
            {found.map((u) => (
              <label
                className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2"
                htmlFor={`access-${u.id}`}
                key={u.id}
              >
                <Checkbox
                  checked={state.picked.has(u.id)}
                  id={`access-${u.id}`}
                  onCheckedChange={(on) => {
                    const next = new Set(state.picked);
                    if (on) {
                      next.add(u.id);
                    } else {
                      next.delete(u.id);
                    }
                    save("selected", next);
                  }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{u.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {u.email}
                  </span>
                </span>
              </label>
            ))}
          </Rows>
        </>
      )}
    </Section>
  );
};

/** Fits a picture into a small square (its middle), as a data URL: what the catalog keeps, no file storage yet. */
const toLogo = async (file: File) => {
  const image = await createImageBitmap(file);
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const side = Math.min(image.width, image.height);
  canvas
    .getContext("2d")
    ?.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    );
  image.close();
  return canvas.toDataURL("image/webp", 0.9);
};

/** The server's picture: its letter until one is chosen; a click picks an image, the cross takes it away. */
const LogoPicker = ({ item }: { item: CatalogItem }) => {
  const t = useTranslations("connections.detail");
  const [, startChange] = useTransition();
  const [logo, setOptimisticLogo] = useOptimistic(item.logo);
  return (
    <div className="group/logo relative shrink-0">
      <label className="block cursor-pointer" title={t("logoUpload")}>
        <BrandLogo label={item.title} logo={logo ?? undefined} size={48} />
        <input
          accept="image/png,image/jpeg,image/webp"
          aria-label={t("logoUpload")}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              startChange(async () => {
                const next = await toLogo(file);
                setOptimisticLogo(next);
                await setLogo(item.id, next);
              });
            }
          }}
          type="file"
        />
      </label>
      {logo && (
        <button
          aria-label={t("logoRemove")}
          className="bg-background text-muted-foreground hover:text-foreground absolute -top-1.5 -right-1.5 hidden size-5 place-items-center rounded-full border group-hover/logo:grid"
          onClick={() =>
            startChange(async () => {
              setOptimisticLogo(null);
              await setLogo(item.id, null);
            })
          }
          type="button"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
};

/**
 * One MCP server of the catalog (M4): its state and check up top, then the server, who signs in and how, and the
 * tools it gave at the last check — each with its policy: the model calls it, asks first, or never sees it.
 */
export const ServerDetail = ({
  item,
  hint,
  oauthFailed,
  picked,
  users,
}: {
  item: CatalogItem;
  hint: string | null;
  oauthFailed: boolean;
  picked: string[];
  users: { id: string; name: string; email: string }[];
}) => {
  const t = useTranslations("connections.detail");
  const tt = useTranslations("connections.status");
  const router = useRouter();
  const [name, setName] = useState(item.title);
  const [url, setUrl] = useState(item.config.url);
  const [checking, startCheck] = useTransition();
  const [, startChange] = useTransition();
  const [removing, startRemove] = useTransition();
  const [enabled, setOptimisticEnabled] = useOptimistic(item.enabled);
  const state: PillState = checking
    ? "checking"
    : (item.health?.state ?? "unchecked");

  // A check only checks; the provider's sign-in page opens only when the user asked to sign in.
  const runCheck = (signIn = false) =>
    startCheck(async () => {
      const result = await check(item.id);
      if (signIn && result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
      }
    });

  const saveName = () => {
    const next = name.trim();
    if (!next) {
      setName(item.title);
    } else if (next !== item.title) {
      startChange(() => rename(item.id, next));
    }
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <LogoPicker item={item} />
          <div className="flex min-w-0 flex-col gap-1">
            <Input
              {...NO_AUTOFILL}
              aria-label={t("name")}
              className="hover:border-input h-8 border-transparent bg-transparent px-1.5 text-xl font-semibold shadow-none md:text-xl dark:bg-transparent"
              onBlur={saveName}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              value={name}
            />
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 px-1.5 text-sm">
              <span className={cn("size-2 rounded-full", DOT[state])} />
              {state === "auth" && item.config.auth !== "oauth"
                ? t("pill.refused")
                : t(`pill.${state}`)}
              {state === "ok" && (
                <span>· {tt("ok", { count: item.tools.length })}</span>
              )}
              {state === "error" && item.health?.error && (
                <span className="max-w-md truncate" title={item.health.error}>
                  · {item.health.error}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-2 text-sm"
            title={t("enabledHint")}
          >
            {t("enabled")}
            <Switch
              checked={enabled}
              onCheckedChange={(on) =>
                startChange(async () => {
                  setOptimisticEnabled(on);
                  await setEnabled(item.id, on);
                })
              }
            />
          </label>
          <Button
            disabled={checking}
            onClick={() => runCheck()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn(checking && "animate-spin")} />
            {t("check")}
          </Button>
        </div>
      </header>

      <Section title={t("server")}>
        <Rows>
          <Row label={t("url")}>
            <Input
              {...NO_AUTOFILL}
              className="w-full font-mono md:w-96"
              onBlur={() => {
                if (url.trim() !== item.config.url) {
                  startChange(async () => {
                    const result = await setServer(item.id, {
                      url: url.trim(),
                    });
                    if (!result.ok) {
                      setUrl(item.config.url);
                    }
                  });
                }
              }}
              onChange={(e) => setUrl(e.target.value)}
              value={url}
            />
          </Row>
          <Row hint={t("transportHint")} label={t("transport")}>
            <Select
              onValueChange={(v) =>
                startChange(async () => {
                  await setServer(item.id, { transport: String(v) });
                })
              }
              value={item.config.transport}
            >
              <SelectTrigger className="w-full md:w-48">
                <SelectValue>
                  {item.config.transport === "http" ? "Streamable HTTP" : "SSE"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {mcpTransports.map((x) => (
                  <SelectItem key={x} value={x}>
                    {x === "http" ? "Streamable HTTP" : "SSE"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row hint={t("prefixHint")} label={t("prefix")}>
            <code className="text-muted-foreground font-mono text-sm">
              {item.key}_…
            </code>
          </Row>
        </Rows>
      </Section>

      <AccessSection
        checking={checking}
        hint={hint}
        item={item}
        oauthFailed={oauthFailed}
        onCheck={runCheck}
      />
      <UsersSection item={item} picked={picked} users={users} />
      <ToolsSection item={item} />

      <Section title={t("remove.section")}>
        <Rows>
          <Row hint={t("remove.hint")} label={t("remove.label")}>
            <Button
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  await remove(item.id);
                  router.push("/settings/connections");
                })
              }
              size="sm"
              variant="destructive"
            >
              {t("remove.confirm")}
            </Button>
          </Row>
        </Rows>
      </Section>
    </>
  );
};
