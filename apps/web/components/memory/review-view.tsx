"use client";

import type { MemoryStaleRow } from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { toast } from "@metobe/ui/components/sonner";
import { cn } from "@metobe/ui/lib/utils";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Check,
  Clock,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { daysUntil, moveTargets } from "@/lib/memory-dates";

import { ENTER, PRESS } from "./memory-record";

// «Сверка» (Д2, P20 «По одному»): the long-open commitments one at a time. Each of the four ways to settle one is a
// call the page already has (a status, a new deadline) or «Оставить» (`/keep`); «Вернуть последнее» puts back what
// the last one was. The keys 1–4 settle, Backspace or Z goes back; nothing here waits for a save to move on.

type Choice = "done" | "keep" | "moved" | "cancelled";

/** What the last answer changed, to put it back. */
interface Step {
  choice: Choice;
  row: MemoryStaleRow;
}

const ACTIONS = [
  { choice: "done", icon: Check, key: "1" },
  { choice: "keep", icon: Clock, key: "2" },
  { choice: "moved", icon: CalendarClock, key: "3" },
  { choice: "cancelled", icon: Ban, key: "4" },
] as const;

const patch = (id: string, body: object) =>
  fetch(`/api/memory/records/${id}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

/** The call that settles a row; `null` deadline — «без срока». */
const settle = (row: MemoryStaleRow, choice: Choice, dueAt?: Date | null) => {
  switch (choice) {
    case "done": {
      return patch(row.id, { status: "done" });
    }
    case "cancelled": {
      return patch(row.id, { status: "cancelled" });
    }
    case "keep": {
      return fetch(`/api/memory/records/${row.id}/keep`, { method: "POST" });
    }
    default: {
      return patch(row.id, { dueAt: dueAt?.toISOString() ?? null });
    }
  }
};

/** The call that puts a settled row back as it was. */
const unsettle = (row: MemoryStaleRow, choice: Choice) => {
  switch (choice) {
    case "keep": {
      return fetch(`/api/memory/records/${row.id}/keep`, { method: "DELETE" });
    }
    case "moved": {
      return patch(row.id, { dueAt: row.dueAt });
    }
    default: {
      return patch(row.id, { status: row.status ?? "open" });
    }
  }
};

/** Whether a call went through. */
const succeeded = async (call: Promise<Response>) => {
  try {
    const response = await call;
    return response.ok;
  } catch {
    return false;
  }
};

export const ReviewView = ({
  rows,
  now,
  timeZone,
}: {
  rows: MemoryStaleRow[];
  now: string;
  timeZone: string;
}) => {
  const t = useTranslations("memory");
  const [at, setAt] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [moving, setMoving] = useState(false);
  // The calls go one after another, whatever the pace of the keys: the screen moves at once, the memory follows.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((task: () => Promise<void>) => {
    const run = async () => {
      await queue.current;
      await task();
    };
    queue.current = run();
  }, []);
  const row = rows[at];

  const decide = useCallback(
    (choice: Choice, dueAt?: Date | null) => {
      if (!row) {
        return;
      }
      setMoving(false);
      setSteps((s) => [...s, { choice, row }]);
      setAt((n) => n + 1);
      enqueue(async () => {
        if (!(await succeeded(settle(row, choice, dueAt)))) {
          // Not saved: the row comes back to be settled again.
          toast.error(t("failed"));
          setSteps((s) => s.filter((step) => step.row.id !== row.id));
          setAt((n) => Math.min(n, rows.indexOf(row)));
        }
      });
    },
    [enqueue, row, rows, t]
  );

  const back = useCallback(() => {
    const last = steps.at(-1);
    if (!last) {
      return;
    }
    setMoving(false);
    setSteps((s) => s.slice(0, -1));
    setAt((n) => Math.max(0, n - 1));
    enqueue(async () => {
      if (!(await succeeded(unsettle(last.row, last.choice)))) {
        toast.error(t("failed"));
      }
    });
  }, [enqueue, steps, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (e.key === "Backspace" || e.key.toLowerCase() === "z") {
        back();
        return;
      }
      const action = ACTIONS.find((a) => a.key === e.key);
      if (action && row) {
        if (action.choice === "moved") {
          setMoving(true);
        } else {
          decide(action.choice);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, decide, row]);

  const targets = moveTargets(new Date(now), timeZone);
  const count = (c: Choice) => steps.filter((s) => s.choice === c).length;
  const sides = (r: MemoryStaleRow) => {
    const who = r.who?.name ?? "";
    if (r.side === "theirs") {
      return t("reviewTheirs", { name: who });
    }
    return r.side === "mine" ? t("reviewMine", { name: who }) : who;
  };
  const given = (r: MemoryStaleRow) =>
    r.givenAt
      ? t("reviewGiven", {
          days: Math.abs(
            daysUntil(new Date(r.givenAt), new Date(now), timeZone)
          ),
        })
      : t("reviewGivenUnknown");
  const due = (r: MemoryStaleRow) => {
    if (!r.dueAt) {
      return t("reviewNoDue");
    }
    const days = daysUntil(new Date(r.dueAt), new Date(now), timeZone);
    return days === 0 ? t("today") : t("overdue", { days: -days });
  };

  return (
    <div className="bg-background min-h-svh overflow-y-auto px-4 py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <header className="flex items-center justify-between">
          <Button
            className={PRESS}
            disabled={steps.length === 0}
            onClick={back}
            size="sm"
            variant="ghost"
          >
            <ArrowLeft /> {t("back")}
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {t("reviewCount", {
              at: Math.min(at + 1, rows.length),
              total: rows.length,
            })}
          </span>
        </header>
        <div aria-hidden className="bg-muted h-1 overflow-hidden rounded-full">
          <div
            className="bg-foreground/70 h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{
              width: `${rows.length === 0 ? 100 : (at / rows.length) * 100}%`,
            }}
          />
        </div>
        {row ? (
          <article
            className={cn("flex flex-col gap-5 rounded-xl border p-5", ENTER)}
            key={row.id}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-sm">
                {row.who ? (
                  <Link
                    className="hover:text-foreground underline-offset-2 hover:underline"
                    href={`/memory?card=${row.who.id}`}
                  >
                    {sides(row)}
                  </Link>
                ) : (
                  sides(row)
                )}
              </span>
              <p className="text-xl leading-snug font-medium">{row.text}</p>
            </div>
            <dl className="text-muted-foreground flex flex-col gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0">{t("reviewGivenLabel")}</dt>
                <dd>{given(row)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0">{t("reviewQuietLabel")}</dt>
                <dd>{t("reviewDays", { days: row.quiet })}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0">{t("reviewDueLabel")}</dt>
                <dd>{due(row)}</dd>
              </div>
            </dl>
            {moving ? (
              <div className={cn("flex flex-wrap gap-2", ENTER)}>
                <Button
                  className={PRESS}
                  onClick={() => decide("moved", targets.tomorrow)}
                  variant="outline"
                >
                  {t("moveTomorrow")}
                </Button>
                <Button
                  className={PRESS}
                  onClick={() => decide("moved", targets.monday)}
                  variant="outline"
                >
                  {t("moveMonday")}
                </Button>
                <Button
                  className={PRESS}
                  onClick={() => decide("moved", targets.week)}
                  variant="outline"
                >
                  {t("moveWeek")}
                </Button>
                <Button
                  className={PRESS}
                  onClick={() => decide("moved", null)}
                  variant="outline"
                >
                  {t("noDue")}
                </Button>
                <Button
                  className={PRESS}
                  onClick={() => setMoving(false)}
                  variant="ghost"
                >
                  {t("reviewCancelMove")}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                {ACTIONS.map((a) => (
                  <Button
                    className={cn("justify-start", PRESS)}
                    key={a.choice}
                    onClick={() =>
                      a.choice === "moved" ? setMoving(true) : decide(a.choice)
                    }
                    variant="outline"
                  >
                    <a.icon /> {t(`review_${a.choice}`)}
                    <Kbd className="ms-auto max-sm:hidden">{a.key}</Kbd>
                  </Button>
                ))}
              </div>
            )}
          </article>
        ) : (
          <div
            className={cn(
              "flex flex-col items-start gap-3 rounded-xl border p-5",
              ENTER
            )}
          >
            <p className="text-lg font-medium">
              {rows.length === 0 ? t("reviewNone") : t("reviewAllDone")}
            </p>
            {rows.length > 0 && (
              <p className="text-muted-foreground text-sm">
                {t("reviewTally", {
                  cancelled: count("cancelled"),
                  done: count("done"),
                  keep: count("keep"),
                  moved: count("moved"),
                })}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                className={PRESS}
                nativeButton={false}
                render={<Link href="/memory" />}
                size="sm"
                variant="outline"
              >
                {t("reviewToMemory")}
              </Button>
              {steps.length > 0 && (
                <Button
                  className={PRESS}
                  onClick={back}
                  size="sm"
                  variant="ghost"
                >
                  <Undo2 /> {t("reviewUndoLast")}
                </Button>
              )}
            </div>
          </div>
        )}
        <p className="text-muted-foreground text-xs max-sm:hidden">
          {t("reviewKeys")}
        </p>
      </div>
    </div>
  );
};
