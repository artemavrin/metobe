"use client";

import type { SandboxLimits, SandboxStatus } from "@metobe/contracts/sandbox";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metobe/ui/components/empty";
import { Input } from "@metobe/ui/components/input";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { toast } from "@metobe/ui/components/sonner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import {
  Check,
  CircleAlert,
  Power,
  RefreshCw,
  SquareTerminal,
  TriangleAlert,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { dropBox, setSandboxLimit, setSandboxOn } from "./actions";

// The sandbox (D47), as chosen in P35 «Сводка»: on or off; now — three numbers and the boxes, each can be shut down;
// limits always open, each saving itself when the field is left (Enter, Tab, a click away; Esc puts it back); the
// internet. Limits are kept by the app and handed to the service, which takes them without a restart.

type Tone = "ok" | "bad" | "warn" | "off";

const Dot = ({ tone, pulse }: { tone: Tone; pulse?: boolean }) => (
  <span
    className={cn(
      "size-2 shrink-0 rounded-full",
      tone === "ok" && "bg-success",
      tone === "bad" && "bg-destructive",
      tone === "warn" && "bg-warning",
      tone === "off" && "bg-muted-foreground/40",
      pulse && "animate-pulse"
    )}
  />
);

const Tile = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) => (
  <div className="flex flex-col gap-1 rounded-lg border px-4 py-3">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="flex items-center gap-2 text-lg font-semibold tabular-nums">
      {tone && <Dot tone={tone} />}
      {value}
    </span>
  </div>
);

type Box = SandboxStatus["boxes"][number];

const initials = (name: string) =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

const KillDialog = ({
  box,
  onClose,
}: {
  box: Box | null;
  onClose: () => void;
}) => {
  const t = useTranslations("sandbox.boxes");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={box !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("killTitle")}</DialogTitle>
          <DialogDescription>
            {t("killText", {
              busy: box?.busy ? "yes" : "no",
              kind: box?.class ?? "chat",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} variant="outline">
            {t("cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (box && !(await dropBox(box.key))) {
                  toast.error(t("killFailed"));
                }
                onClose();
                router.refresh();
              })
            }
            variant="destructive"
          >
            {t("kill")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const BoxList = ({
  boxes,
  names,
}: {
  boxes: Box[];
  names: Record<string, string>;
}) => {
  const t = useTranslations("sandbox.boxes");
  const f = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const [target, setTarget] = useState<Box | null>(null);
  if (boxes.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
        {t("empty")}
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y rounded-lg border">
        {boxes.map((b) => {
          const name = names[b.userId] ?? t("unknown");
          const minutes = Math.max(
            0,
            Math.round(
              (now.getTime() - new Date(b.createdAt).getTime()) / 60_000
            )
          );
          return (
            <li
              className="group flex min-h-14 items-center gap-3 px-4 py-2.5"
              key={`${b.key}:${b.createdAt}`}
            >
              <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                {initials(name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{name}</span>
                <span className="text-muted-foreground text-xs">
                  {t(b.class === "task" ? "task" : "chat")} ·{" "}
                  {t("age", { minutes })}
                </span>
              </span>
              <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-sm tabular-nums">
                <Dot pulse={b.busy} tone={b.busy ? "warn" : "off"} />
                <span className="max-sm:hidden">
                  {b.busy || !b.idleUntil
                    ? t("busy")
                    : t("idle", {
                        time: f.dateTime(new Date(b.idleUntil), {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      })}
                </span>
              </span>
              <Button
                aria-label={t("kill")}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                onClick={() => setTarget(b)}
                size="icon-sm"
                variant="ghost"
              >
                <Power />
              </Button>
            </li>
          );
        })}
      </ul>
      <KillDialog box={target} onClose={() => setTarget(null)} />
    </>
  );
};

// ── Limits ───────────────────────────────────────────────────────────────────────────────────────────────────────────

type NumberKey = Exclude<keyof SandboxLimits, "network">;

/** A field as the admin sees it: idle time in minutes, kept in seconds. */
interface Field {
  id:
    | "total"
    | "perUser"
    | "idleMinutes"
    | "memoryMb"
    | "runSeconds"
    | "fileMb";
  key: NumberKey;
  min: number;
  max: (l: SandboxLimits) => number;
  /** Shown value from the kept one, and back. */
  scale: number;
}

// The bounds are the contract's (sandboxLimitsSchema): the server checks again.
const FIELDS: Field[] = [
  { id: "total", key: "total", max: () => 32, min: 1, scale: 1 },
  { id: "perUser", key: "perUser", max: (l) => l.total, min: 1, scale: 1 },
  { id: "idleMinutes", key: "idleSeconds", max: () => 60, min: 1, scale: 60 },
  { id: "memoryMb", key: "memoryMb", max: () => 8192, min: 1024, scale: 1 },
  { id: "runSeconds", key: "runSeconds", max: () => 600, min: 10, scale: 1 },
  { id: "fileMb", key: "fileMb", max: () => 100, min: 1, scale: 1 },
];

const LimitField = ({
  field,
  limits,
}: {
  field: Field;
  limits: SandboxLimits;
}) => {
  const t = useTranslations("sandbox.limits");
  const router = useRouter();
  const saved = String(limits[field.key] / field.scale);
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  // A value saved elsewhere (another admin, a refresh) shows unless this field is being typed in.
  const [shown, setShown] = useState(saved);
  if (shown !== saved) {
    setShown(saved);
    setText(saved);
  }

  const problem = (value: number) => {
    if (!Number.isInteger(value)) {
      return t("integer");
    }
    if (value < field.min) {
      return t("min", { n: field.min });
    }
    const max = field.max(limits);
    if (value > max) {
      return field.id === "perUser"
        ? t("perUserMax", { n: max })
        : t("max", { n: max });
    }
    return null;
  };

  const save = () => {
    if (text.trim() === saved) {
      setText(saved);
      setError(null);
      return;
    }
    const value = text.trim() === "" ? Number.NaN : Number(text.trim());
    const why = problem(value);
    setError(why);
    if (why) {
      return;
    }
    start(async () => {
      if (!(await setSandboxLimit(field.key, value * field.scale))) {
        setError(t("saveFailed"));
        return;
      }
      setDone(true);
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => setDone(false), 1500);
      router.refresh();
    });
  };

  const label = t(`${field.id}.label`);
  return (
    <Row hint={t(`${field.id}.hint`)} label={label}>
      <span className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-2">
          <Check
            aria-label={done ? t("saved") : undefined}
            className={cn(
              "text-success size-4 transition-opacity duration-300",
              done ? "opacity-100" : "opacity-0"
            )}
          />
          <Input
            aria-invalid={error !== null}
            aria-label={label}
            className="w-24 text-right tabular-nums"
            disabled={pending}
            inputMode="numeric"
            onBlur={save}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                // Puts the field back without closing the settings window around it.
                e.stopPropagation();
                setText(saved);
                setError(null);
              }
            }}
            value={text}
          />
          <span className="text-muted-foreground w-8 text-sm">
            {t(`${field.id}.unit`)}
          </span>
        </span>
        {error && <span className="text-destructive text-xs">{error}</span>}
      </span>
    </Row>
  );
};

const gb = (mb: number) => Math.round((mb / 1024) * 10) / 10;

const Limits = ({
  limits,
  hostMemoryMb,
}: {
  limits: SandboxLimits;
  hostMemoryMb?: number;
}) => {
  const t = useTranslations("sandbox.limits");
  const need = limits.total * limits.memoryMb;
  const over = hostMemoryMb !== undefined && need > hostMemoryMb * 0.75;
  return (
    <Section title={t("title")}>
      <Rows>
        {FIELDS.map((field) => (
          <LimitField field={field} key={field.id} limits={limits} />
        ))}
      </Rows>
      <p
        className={cn(
          "-mt-1 text-xs",
          over ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {t("memory", {
          host: hostMemoryMb === undefined ? "none" : String(gb(hostMemoryMb)),
          need: String(gb(need)),
        })}
        {over && t("memoryOver")}. {t("applies")}
      </p>
    </Section>
  );
};

const Access = ({
  network,
  enabled,
}: {
  network: boolean;
  enabled: boolean;
}) => {
  const t = useTranslations("sandbox.access");
  const router = useRouter();
  const [on, setOn] = useState(network);
  const [pending, start] = useTransition();
  return (
    <Section title={t("title")}>
      <Rows>
        <Row label={t("network")} hint={on ? t("networkOn") : t("networkOff")}>
          <Switch
            aria-label={t("network")}
            checked={on}
            disabled={!enabled || pending}
            onCheckedChange={(value) => {
              setOn(value);
              start(async () => {
                if (!(await setSandboxLimit("network", value))) {
                  setOn(!value);
                }
                router.refresh();
              });
            }}
          />
        </Row>
      </Rows>
      {on && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>{t("warning")}</AlertDescription>
        </Alert>
      )}
    </Section>
  );
};

const CheckButton = () => {
  const t = useTranslations("sandbox.now");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      size="sm"
      variant="outline"
    >
      <RefreshCw className={cn(pending && "animate-spin")} />
      {t("check")}
    </Button>
  );
};

const Now = ({
  status,
  enabled,
  limits,
  names,
}: {
  status: SandboxStatus | null;
  enabled: boolean;
  limits: SandboxLimits;
  names: Record<string, string>;
}) => {
  const t = useTranslations("sandbox.now");
  if (!status) {
    return (
      <Section action={<CheckButton />} title={t("title")}>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{t("down")}</AlertDescription>
        </Alert>
      </Section>
    );
  }
  const runc = status.runtime !== "runsc";
  let works = t("ready");
  let tone: Tone = runc ? "warn" : "ok";
  if (!enabled) {
    works = t("turnedOff");
    tone = "off";
  } else if (!status.ready) {
    works = status.problem ? t(`problems.${status.problem}`) : t("notReady");
    tone = "bad";
  }
  const used = status.boxes.length;
  return (
    <Section
      action={<CheckButton />}
      meta={`${runc ? t("runc") : t("gvisor")} · ${status.image}`}
      title={t("title")}
    >
      {runc && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{t("runcHint")}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
        <Tile label={t("works")} tone={tone} value={works} />
        <Tile
          label={t("busy")}
          tone={used >= limits.total ? "warn" : undefined}
          value={t("busyValue", { total: limits.total, used })}
        />
        <Tile
          label={t("waiting")}
          tone={status.waiting > 0 ? "warn" : undefined}
          value={status.waiting}
        />
      </div>
      {enabled && <BoxList boxes={status.boxes} names={names} />}
    </Section>
  );
};

export const SandboxSettings = ({
  installed,
  enabled,
  limits,
  status,
  names,
}: {
  installed: boolean;
  enabled: boolean;
  limits: SandboxLimits;
  status: SandboxStatus | null;
  names: Record<string, string>;
}) => {
  const t = useTranslations("sandbox");
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  if (!installed) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <SquareTerminal />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("off.title")}</EmptyTitle>
          <EmptyDescription>{t("off.text")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <Rows>
        <Row hint={t("enabled.hint")} label={t("enabled.label")}>
          <Switch
            aria-label={t("enabled.label")}
            checked={on}
            disabled={pending}
            onCheckedChange={(value) => {
              setOn(value);
              start(async () => {
                await setSandboxOn(value);
                router.refresh();
              });
            }}
          />
        </Row>
      </Rows>
      <Now enabled={on} limits={limits} names={names} status={status} />
      <Limits hostMemoryMb={status?.hostMemoryMb} limits={limits} />
      <Access enabled={on} network={limits.network} />
    </>
  );
};
