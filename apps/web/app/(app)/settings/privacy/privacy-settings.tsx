"use client";

import type { SandboxResult } from "@metobe/core/ai";
import type {
  GuardCheck,
  PrivacyAction,
  PrivacyPlace,
  PrivacyRetention,
  PrivacySettings,
  PrivacyType,
} from "@metobe/core/privacy-settings";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Switch } from "@metobe/ui/components/switch";
import { Textarea } from "@metobe/ui/components/textarea";
import { cn } from "@metobe/ui/lib/utils";
import {
  Cake,
  CircleAlert,
  CreditCard,
  IdCard,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useOptimistic, useState, useTransition } from "react";

import { Seen } from "@/components/chat/model-lens";
import { EditRow } from "@/components/settings/edit-row";
import { Row, Rows, Section } from "@/components/settings/rows";
import { toneOf } from "@/lib/label-tone";
import { splitLabels } from "@/lib/model-view";

import {
  recheck,
  sandbox,
  saveAddress,
  setKeepFor,
  setTypeAction,
  toggleLocal,
  toggleOn,
  togglePlace,
} from "./actions";

// Data protection (PII-GUARD-PLAN З6, P31 «Настройки»): whether it masks, the service and its state, where it applies,
// what happens to each type of data, local models, how long «what the model saw» is kept, and a sandbox.

type T = ReturnType<typeof useTranslations<"privacy">>;

const PLACES: readonly PrivacyPlace[] = [
  "chat",
  "tasks",
  "telegram",
  "memory",
  "service",
];

/** Each type, its icon and what the model sees instead; its colour is the chips' (lib/label-tone.ts). */
const TYPES: readonly {
  type: PrivacyType;
  icon: LucideIcon;
  label: string;
}[] = [
  {
    icon: UserRound,
    label: "Персона_Женщина_7f3a01",
    type: "PERSON",
  },
  {
    icon: Phone,
    label: "[[PHONE_a91c02]]",
    type: "PHONE",
  },
  {
    icon: Mail,
    label: "[[EMAIL_3b7e11]]",
    type: "EMAIL",
  },
  {
    icon: IdCard,
    label: "[[ID_DOCUMENT_c40d9e]]",
    type: "ID_DOCUMENT",
  },
  {
    icon: MapPin,
    label: "[[ADDRESS_5e2f10]]",
    type: "ADDRESS",
  },
  {
    icon: CreditCard,
    label: "[[BANK_ACCOUNT_88aa01]]",
    type: "BANK_ACCOUNT",
  },
  {
    icon: Cake,
    label: "[[DATE_OF_BIRTH_2d7c55]]",
    type: "DATE_OF_BIRTH",
  },
];

const ACTIONS: readonly PrivacyAction[] = ["hide", "keep", "block"];
const RETENTION: readonly PrivacyRetention[] = ["chat", "30", "7", "none"];

const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-bwignore": true,
  "data-form-type": "other",
  "data-lpignore": "true",
  spellCheck: false,
} as const;

const stateLabel = (check: GuardCheck, busy: boolean, t: T) => {
  if (busy) {
    return t("service.state.running");
  }
  if (check.ok) {
    return check.ready
      ? t("service.state.ok", { ms: check.ms })
      : t("service.state.loading");
  }
  return t(`service.state.${check.reason}`);
};

const stateDot = (check: GuardCheck, busy: boolean) => {
  if (busy) {
    return "bg-warning animate-pulse";
  }
  if (!check.ok) {
    return check.reason === "unset"
      ? "bg-muted-foreground/40"
      : "bg-destructive";
  }
  return check.ready ? "bg-success" : "bg-warning";
};

/** The sandbox: the text as an external model would get it under the rules above. */
const Sandbox = ({ t }: { t: T }) => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{
    text: string;
    got: SandboxResult;
  } | null>(null);
  useEffect(() => {
    if (!text.trim()) {
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const got = await sandbox(text);
      if (live) {
        setResult({ got, text });
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text]);
  const got = text.trim() && result?.text === text ? result.got : null;
  const hidden =
    got?.state === "masked" ? new Set(got.labels.map((l) => l.value)).size : 0;
  return (
    <Section meta={t("sandbox.meta")} title={t("sandbox.title")}>
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <Textarea
          aria-label={t("sandbox.label")}
          className="min-h-24 text-sm"
          onChange={(e) => setText(e.target.value)}
          placeholder={t("sandbox.placeholder")}
          value={text}
        />
        {got?.state === "unset" && (
          <p className="text-muted-foreground text-sm">{t("sandbox.unset")}</p>
        )}
        {got?.state === "down" && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{t("sandbox.down")}</AlertDescription>
          </Alert>
        )}
        {got?.state === "masked" && (
          <>
            <span className="text-muted-foreground text-sm">
              {hidden > 0
                ? t("sandbox.hidden", { count: hidden })
                : t("sandbox.nothing")}
            </span>
            {got.blocked.length > 0 && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>
                  {t("sandbox.blocked", {
                    types: got.blocked
                      .map((type) =>
                        t(`types.${type as PrivacyType}`).toLowerCase()
                      )
                      .join(", "),
                  })}
                </AlertDescription>
              </Alert>
            )}
            {hidden > 0 && (
              <p className="bg-muted/40 rounded-md px-3 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap">
                <Seen pieces={splitLabels(got.text, got.labels)} />
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  );
};

export const PrivacySettingsForm = ({
  settings,
  check,
  defaultUrl,
}: {
  settings: PrivacySettings;
  check: GuardCheck;
  /** PII_GUARD_URL of the install: what an empty address goes back to. */
  defaultUrl: string | null;
}) => {
  const t = useTranslations("privacy");
  const [, startChange] = useTransition();
  const [checking, startCheck] = useTransition();
  const [draft, setDraft] = useState(settings.url ?? "");
  const [shown, patch] = useOptimistic(
    settings,
    (current, change: Partial<PrivacySettings>) => ({ ...current, ...change })
  );
  const change = (next: Partial<PrivacySettings>, save: () => Promise<void>) =>
    startChange(async () => {
      patch(next);
      await save();
    });
  const address = settings.url ?? defaultUrl;
  const down = shown.on && !check.ok && check.reason !== "unset";

  return (
    <>
      <Rows>
        <Row hint={t("on.hint")} label={t("on.label")}>
          <Switch
            aria-label={t("on.label")}
            checked={shown.on}
            onCheckedChange={(on) => change({ on }, () => toggleOn(on))}
          />
        </Row>
      </Rows>

      <Section
        action={
          address && (
            <Button
              disabled={checking}
              onClick={() => startCheck(() => recheck())}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={cn(checking && "animate-spin")} />
              {t("service.recheck")}
            </Button>
          )
        }
        title={t("service.title")}
      >
        {down && !checking && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{t("service.down")}</AlertDescription>
          </Alert>
        )}
        <Rows>
          <EditRow
            editor={
              <Input
                {...NO_AUTOFILL}
                aria-label={t("service.address.label")}
                autoFocus
                className="font-mono"
                onChange={(e) => setDraft(e.target.value)}
                placeholder={defaultUrl ?? "http://pii-guard:8787"}
                value={draft}
              />
            }
            hint={
              settings.url && defaultUrl
                ? t("service.address.hint", { url: defaultUrl })
                : t("service.address.hintNoDefault")
            }
            label={t("service.address.label")}
            onSave={async () => {
              const result = await saveAddress(draft);
              return result.ok ? null : t("service.address.invalid");
            }}
            value={
              address ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-sm">{address}</span>
                  {!settings.url && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t("service.address.default")}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("service.address.none")}
                </span>
              )
            }
          />
          <Row hint={t("service.state.hint")} label={t("service.state.label")}>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  stateDot(check, checking)
                )}
              />
              <span className="min-w-0 truncate">
                {stateLabel(check, checking, t)}
              </span>
            </span>
          </Row>
        </Rows>
      </Section>

      <Section title={t("places.title")}>
        <Rows>
          {PLACES.map((place) => (
            <Row
              hint={t(`places.${place}.hint`)}
              key={place}
              label={t(`places.${place}.label`)}
            >
              <Switch
                aria-label={t(`places.${place}.label`)}
                checked={shown.on && shown.places[place]}
                disabled={!shown.on}
                onCheckedChange={(on) =>
                  change({ places: { ...shown.places, [place]: on } }, () =>
                    togglePlace(place, on)
                  )
                }
              />
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title={t("types.title")}>
        <Rows>
          {TYPES.map(({ type, icon: Icon, label }) => {
            const tone = toneOf(type).text;
            const value = shown.types[type];
            const name = t(`types.${type}`);
            return (
              <div
                className="flex min-h-14 items-center gap-3 px-4 py-3"
                key={type}
              >
                <Icon className={cn("size-4 shrink-0", tone)} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{name}</span>
                  <span className={cn("truncate font-mono text-xs", tone)}>
                    {label}
                  </span>
                </div>
                <Select
                  disabled={!shown.on}
                  onValueChange={(next) =>
                    change(
                      {
                        types: {
                          ...shown.types,
                          [type]: next as PrivacyAction,
                        },
                      },
                      () => setTypeAction(type, String(next))
                    )
                  }
                  value={value}
                >
                  <SelectTrigger
                    aria-label={name}
                    className="w-48 shrink-0 max-sm:w-40"
                  >
                    <SelectValue>{t(`types.actions.${value}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {t(`types.actions.${a}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </Rows>
        <p className="text-muted-foreground -mt-1 text-xs">{t("types.note")}</p>
      </Section>

      <Section title={t("more.title")}>
        <Rows>
          <Row hint={t("more.local.hint")} label={t("more.local.label")}>
            <Switch
              aria-label={t("more.local.label")}
              checked={shown.on && shown.local}
              disabled={!shown.on}
              onCheckedChange={(local) =>
                change({ local }, () => toggleLocal(local))
              }
            />
          </Row>
          <Row hint={t("more.keep.hint")} label={t("more.keep.label")}>
            <Select
              onValueChange={(next) =>
                change({ keepFor: next as PrivacyRetention }, () =>
                  setKeepFor(String(next))
                )
              }
              value={shown.keepFor}
            >
              <SelectTrigger
                aria-label={t("more.keep.label")}
                className="w-full md:w-44"
              >
                <SelectValue>{t(`more.keepFor.${shown.keepFor}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RETENTION.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`more.keepFor.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Rows>
      </Section>

      <Sandbox t={t} />
    </>
  );
};
