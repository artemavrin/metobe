"use client";

import { UPDATE_STEPS } from "@metobe/contracts/updates";
import type { UpdateRun, UpdateStep } from "@metobe/contracts/updates";
import type { UpdateCheck } from "@metobe/core/updates";
import { Button } from "@metobe/ui/components/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@metobe/ui/components/reui/alert";
import { Badge } from "@metobe/ui/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@metobe/ui/components/reui/frame";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { checkUpdatesNow, startUpdate } from "./actions";

// The version card of «О системе» (D35, prototype «Карточка»): what runs, and when GitHub has something newer — its
// notes (every release past this one, together) and the button for the updater, or the installer's command when this
// server has none. While the updater works, its steps take the card's place; then how it ended.

const INSTALL =
  "curl -fsSL https://github.com/artemavrin/metobe/releases/latest/download/install.sh | bash";
const SHOWN = 3;
/** How long the outcome of the last run stays on the card. */
const RECENT_MS = 60 * 60 * 1000;
const POLL_MS = 1500;
/** The updater drops an ask it did not take in two minutes; the page stops waiting a little later. */
const ASK_MS = 150_000;

/** «1 мин 04 с» from seconds. */
export const useTook = () => {
  const t = useTranslations("about");
  return (seconds: number) => {
    const s = Math.max(0, Math.round(seconds));
    return s < 60
      ? t("tookSec", { s })
      : t("tookMin", {
          m: Math.floor(s / 60),
          s: String(s % 60).padStart(2, "0"),
        });
  };
};

const NoteList = ({
  title,
  items,
  all,
}: {
  title: string;
  items: string[];
  all: boolean;
}) =>
  items.length === 0 ? null : (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-muted-foreground text-xs font-medium">
        {title} · {items.length}
      </h4>
      <ul className="flex flex-col gap-1.5">
        {(all ? items : items.slice(0, SHOWN)).map((it) => (
          <li className="flex gap-2 text-sm leading-snug" key={it}>
            <span
              aria-hidden
              className="bg-muted-foreground/50 mt-[0.45rem] size-1 shrink-0 rounded-full"
            />
            <span className="first-letter:uppercase">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );

/** What is new and fixed in every release past this one; three of each, the rest on a click. */
const Notes = ({ newer }: { newer: UpdateCheck["newer"] }) => {
  const t = useTranslations("about");
  const [all, setAll] = useState(false);
  const features = newer.flatMap((r) => r.features);
  const fixes = newer.flatMap((r) => r.fixes);
  const hidden =
    Math.max(features.length - SHOWN, 0) + Math.max(fixes.length - SHOWN, 0);
  if (features.length + fixes.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noNotes")}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 @2xl:grid-cols-2">
        <NoteList all={all} items={features} title={t("features")} />
        <NoteList all={all} items={fixes} title={t("fixes")} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {hidden > 0 && (
          <Button
            className="-ml-2"
            onClick={() => setAll(!all)}
            size="sm"
            variant="ghost"
          >
            {all ? t("less") : t("more", { count: hidden })}
            <ChevronDown
              className={cn("transition-transform", all && "rotate-180")}
            />
          </Button>
        )}
        {newer[0] && (
          <a
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            href={newer[0].url}
            rel="noreferrer"
            target="_blank"
          >
            {t("github")}
            <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};

/** No updater on this server: the installer's command, a click to copy. */
const Manual = ({ version }: { version: string }) => {
  const t = useTranslations("about");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {t("manual", { version })}
      </p>
      <div className="bg-muted/60 flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          {INSTALL}
        </code>
        <Button
          aria-label={copied ? t("copied") : t("copy")}
          onClick={() => {
            void navigator.clipboard?.writeText(INSTALL);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          size="icon-sm"
          variant="ghost"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("enable")}</p>
    </div>
  );
};

const CheckNow = () => {
  const t = useTranslations("about");
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => start(() => checkUpdatesNow())}
      size="sm"
      variant="outline"
    >
      {pending && <Spinner />}
      {t("checkNow")}
    </Button>
  );
};

type StepState = UpdateStep["status"];

const Mark = ({ state }: { state: StepState }) => (
  <span
    className={cn(
      "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-200",
      state === "done" &&
        "bg-primary text-primary-foreground border-transparent",
      state === "running" && "bg-background border-foreground/30",
      state === "failed" && "bg-destructive border-transparent text-white",
      state === "waiting" && "bg-background text-muted-foreground"
    )}
  >
    {state === "done" && <Check className="size-3.5" />}
    {state === "running" && <Spinner className="size-3.5" />}
    {state === "failed" && <X className="size-3.5" />}
  </span>
);

/** Why a run failed: a word the updater uses, in the admin's language, or what the failing tool said. */
const useReason = () => {
  const t = useTranslations("about");
  return (error: string | null) => {
    if (!error) {
      return "";
    }
    const key = `errors.${error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : error;
  };
};

/** The steps one under the other: done with what each found, the running one with what it does now. */
const Progress = ({
  run,
  lost,
  now,
}: {
  run: UpdateRun;
  /** The app does not answer: it is restarting. */
  lost: boolean;
  now: number;
}) => {
  const t = useTranslations("about.steps");
  const about = useTranslations("about");
  const format = useFormatter();
  const took = useTook();
  const reason = useReason();
  const mb = (bytes = 0) =>
    format.number(bytes / 1e6, {
      maximumFractionDigits: bytes < 1e7 ? 1 : 0,
      style: "unit",
      unit: "megabyte",
    });
  const line = (i: number, s: UpdateStep) => {
    const key = UPDATE_STEPS[i] ?? "check";
    if (s.status === "failed") {
      return reason(run.error);
    }
    if (s.status === "running") {
      return t(`${key}.doing`, { answers: s.note.answers ?? 0 });
    }
    if (key === "pull") {
      return s.note.cached
        ? t("pull.cached")
        : t("pull.done", { size: mb(s.note.size) });
    }
    if (key === "backup") {
      return t("backup.done", {
        file: s.note.file ?? "",
        size: mb(s.note.size),
      });
    }
    if (key === "restart") {
      if (run.operation === "rollback") {
        return t("restart.rollbackDone", { version: run.to });
      }
      return t("restart.done", {
        migrations: s.note.migrations ?? 0,
        version: run.to,
      });
    }
    return t(`${key}.done`);
  };
  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col gap-4">
        {/* The rail behind the marks. */}
        <span
          aria-hidden
          className="bg-border absolute top-3 bottom-3 left-[11px] w-px"
        />
        {run.steps.map((s, i) => {
          const key = UPDATE_STEPS[i] ?? "check";
          return (
            <li
              aria-current={s.status === "running" ? "step" : undefined}
              className="flex gap-3"
              key={key}
            >
              <Mark state={s.status} />
              <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                <span
                  className={cn(
                    "text-sm font-medium",
                    s.status === "waiting" &&
                      "text-muted-foreground font-normal"
                  )}
                >
                  {t(`${key}.title`, { version: run.to })}
                </span>
                {s.status !== "waiting" && (
                  <span
                    className={cn(
                      "text-xs break-words",
                      s.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {line(i, s)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {run.status === "running" && (
        <p className="text-muted-foreground text-xs tabular-nums">
          {lost
            ? about("restarting")
            : about("running", {
                took: took((now - Date.parse(run.startedAt)) / 1000),
              })}
        </p>
      )}
    </div>
  );
};

/** How the last run ended: what runs now, or what came back and a second try. */
const Outcome = ({
  run,
  retry,
}: {
  run: UpdateRun;
  retry: (() => void) | null;
}) => {
  const t = useTranslations("about");
  const took = useTook();
  const seconds =
    (Date.parse(run.finishedAt ?? run.startedAt) - Date.parse(run.startedAt)) /
    1000;
  if (run.status === "done") {
    if (run.operation === "rollback") {
      return (
        <Alert variant="success">
          <RotateCcw />
          <AlertTitle>{t("rolledBack.title", { version: run.to })}</AlertTitle>
          <AlertDescription>
            {t("rolledBack.text", { took: took(seconds) })}
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="success">
        <Check />
        <AlertTitle>{t("done.title", { version: run.to })}</AlertTitle>
        <AlertDescription>
          {t("done.text", { took: took(seconds) })}
        </AlertDescription>
      </Alert>
    );
  }
  const failedAt = run.steps.findIndex((s) => s.status === "failed");
  const untouched =
    failedAt !== -1 && failedAt < UPDATE_STEPS.indexOf("restart");
  let back = t("failedRun.lost", { version: run.from });
  if (untouched) {
    back = t("failedRun.untouched", { version: run.from });
  } else if (run.restored === "image") {
    back = t("failedRun.image", { version: run.from });
  } else if (run.restored === "image+db") {
    back = t("failedRun.imageDb", { version: run.from });
  }
  return (
    <Alert variant="destructive">
      <RotateCcw />
      <AlertTitle>{t("failedRun.title")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{back}</span>
        {retry && (
          <Button onClick={retry} size="sm" variant="outline">
            {t("failedRun.retry")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

/**
 * The run as it goes: asked from the server every second and a half while it runs (or was just asked for). The app
 * restarts under the page — the asks fail for a few seconds and the card says so; once X answers, the page reloads
 * with X's own code.
 */
const useRun = (
  initial: UpdateRun | null,
  current: string,
  serverNow: string
) => {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const [lost, setLost] = useState(false);
  const [untaken, setUntaken] = useState(false);
  const [now, setNow] = useState(() => Date.parse(serverNow));
  const following = askedAt !== null || run?.status === "running";
  useEffect(() => {
    if (!following) {
      return;
    }
    let stop = false;
    /** The run now; null — the app does not answer (it restarts) or refused. */
    const poll = async () => {
      try {
        const res = await fetch("/api/update", { cache: "no-store" });
        return res.ok
          ? ((await res.json()) as { run: UpdateRun | null })
          : null;
      } catch {
        return null;
      }
    };
    const tick = async () => {
      setNow(Date.now());
      const answer = await poll();
      if (stop) {
        return;
      }
      setLost(answer === null);
      if (askedAt !== null && Date.now() - askedAt > ASK_MS) {
        setAskedAt(null);
        setUntaken(true);
        return;
      }
      const next = answer?.run;
      // The ask is taken once a run newer than it shows up.
      if (
        !next ||
        (askedAt !== null && Date.parse(next.startedAt) < askedAt - 5000)
      ) {
        return;
      }
      setAskedAt(null);
      setRun(next);
      if (next.status === "done" && next.to !== current) {
        window.location.reload();
      } else if (next.status === "failed") {
        // The history below gets the run.
        router.refresh();
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [following, askedAt, current, router]);
  return { askedAt, lost, now, run, setAskedAt, setUntaken, untaken };
};

const RunBadge = ({
  run,
  ended,
  updates,
}: {
  run: UpdateRun | null;
  ended: UpdateRun | null;
  updates: UpdateCheck;
}) => {
  const t = useTranslations("about");
  if (run?.status === "running") {
    return <Badge variant="primary-light">{t("badgeRun.updating")}</Badge>;
  }
  if (ended) {
    return ended.status === "done" ? (
      <Badge variant="success-light">{t("badgeRun.updated")}</Badge>
    ) : (
      <Badge variant="destructive-light">{t("badgeRun.failed")}</Badge>
    );
  }
  if (updates.newer.length > 0) {
    return <Badge variant="warning-light">{t("badge.available")}</Badge>;
  }
  if (updates.checkedAt && !updates.error) {
    return <Badge variant="success-light">{t("badge.latest")}</Badge>;
  }
  return <Badge variant="outline">{t("badge.unknown")}</Badge>;
};

/** A newer version: its notes, and the updater's button — or the installer's command when there is no updater. */
const Available = ({
  updates,
  updater,
  pending,
  refused,
  onUpdate,
}: {
  updates: UpdateCheck;
  updater: string | null;
  pending: boolean;
  refused: boolean;
  onUpdate: (version: string) => void;
}) => {
  const t = useTranslations("about");
  const format = useFormatter();
  const [next] = updates.newer;
  if (!next) {
    return null;
  }
  const earlier = updates.newer.length - 1;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tabular-nums">
          {t("available", { version: next.version })}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("released", {
            date: format.dateTime(new Date(`${next.date}T12:00:00Z`), {
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }),
          })}
          {earlier > 0 && ` · ${t("andEarlier", { count: earlier })}`}
        </p>
      </div>
      <Notes newer={updates.newer} />
      {updater ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {t("whatHappens", {
              current: updates.current,
              version: next.version,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={pending} onClick={() => onUpdate(next.version)}>
              {pending && <Spinner />}
              {t("update", { version: next.version })}
            </Button>
            {refused && (
              <span className="text-destructive text-sm">{t("refused")}</span>
            )}
          </div>
        </div>
      ) : (
        <Manual version={next.version} />
      )}
    </>
  );
};

/** What runs (or what goes to what, while it runs), where it stands, and when GitHub was asked. */
const Header = ({
  run,
  ended,
  updates,
  now,
}: {
  run: UpdateRun | null;
  ended: UpdateRun | null;
  updates: UpdateCheck;
  now: string;
}) => {
  const t = useTranslations("about");
  const format = useFormatter();
  const running = run?.status === "running";
  return (
    <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <FrameTitle className="text-base tabular-nums">
          {run && running
            ? t("versionUpdating", { from: run.from, to: run.to })
            : t("version", { version: updates.current })}
        </FrameTitle>
        <RunBadge ended={ended} run={run} updates={updates} />
      </div>
      {updates.checkedAt && !running && (
        <FrameDescription>
          {t("checked", {
            when: format.relativeTime(
              new Date(updates.checkedAt),
              new Date(now)
            ),
          })}
        </FrameDescription>
      )}
    </FrameHeader>
  );
};

/** The last run, when it ended within the hour: its outcome stays on the card. */
const recent = (run: UpdateRun | null, now: string) =>
  run &&
  run.status !== "running" &&
  Date.parse(now) - Date.parse(run.finishedAt ?? run.startedAt) < RECENT_MS
    ? run
    : null;

export const AboutCard = ({
  updates,
  updater,
  lastRun,
  now: serverNow,
}: {
  updates: UpdateCheck;
  /** The updater's version when one runs on this server. */
  updater: string | null;
  lastRun: UpdateRun | null;
  /** The server's moment, so «проверено 5 минут назад» reads the same before and after hydration. */
  now: string;
}) => {
  const t = useTranslations("about");
  const [next] = updates.newer;
  const { askedAt, lost, now, run, setAskedAt, setUntaken, untaken } = useRun(
    lastRun,
    updates.current,
    serverNow
  );
  const [refused, setRefused] = useState(false);
  const [pending, start] = useTransition();
  const ask = (version: string) =>
    start(async () => {
      const ok = await startUpdate(version);
      setRefused(!ok);
      setUntaken(false);
      if (ok) {
        setAskedAt(Date.now());
      }
    });

  const running = run?.status === "running";
  const ended = recent(run, serverNow);
  const retry =
    ended?.status === "failed" && next && updater
      ? () => ask(next.version)
      : null;

  const available = (
    <Available
      onUpdate={ask}
      pending={pending}
      refused={refused || untaken}
      updater={updater}
      updates={updates}
    />
  );
  let body: React.ReactNode = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {updates.checkedAt ? t("latest") : t("never")}
      </p>
      <CheckNow />
    </div>
  );
  if (run && running) {
    body = <Progress lost={lost} now={now} run={run} />;
  } else if (askedAt !== null) {
    body = (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner />
        {t("asking")}
      </p>
    );
  } else if (ended) {
    // Updated, and there is newer still: that one and its button; otherwise the steps the run took.
    body = (
      <div className="flex flex-col gap-5">
        <Outcome retry={retry} run={ended} />
        {ended.status === "done" && next ? (
          available
        ) : (
          <Progress lost={false} now={now} run={ended} />
        )}
      </div>
    );
  } else if (next) {
    body = available;
  }

  return (
    <Frame className="@container">
      <Header ended={ended} now={serverNow} run={run} updates={updates} />
      <FramePanel className="flex flex-col gap-5">
        {updates.error && !running && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription className="flex flex-col items-start gap-2">
              {t("failed", { reason: updates.error })}
              {next && <CheckNow />}
            </AlertDescription>
          </Alert>
        )}
        {body}
      </FramePanel>
    </Frame>
  );
};
