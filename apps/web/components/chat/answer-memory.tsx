"use client";

import type {
  MemoryCard,
  MemoryRecordView,
  ShowCardOutput,
  ShowPromisesOutput,
} from "@metobe/contracts/memory";
import { MEMORY_SHOWN } from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import { ArrowUpRight } from "lucide-react";
import { useFormatter, useTimeZone, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { WidgetFrame } from "@/components/chat/widget-frame";
import {
  Balance,
  Now,
  Section,
  byUrgency,
  sidesOf,
} from "@/components/memory/card-parts";
import {
  MemoryActionsContext,
  MemoryRecordRow,
  shortDay,
  useDirection,
} from "@/components/memory/memory-record";
import { useActionsOf } from "@/components/memory/use-memory-actions";
import type { CardPart, PromisesPart } from "@/lib/answer-work";

// A card and a list of open promises in the answer (Д1): what `show_card` and `show_promises` left, drawn the way
// the «Память» page draws them, with the same buttons. It shows the memory as it is now, not as the answer found it:
// the records are read again when the chat opens, and what was closed since stands closed. If they cannot be read
// (the memory is off, the card is gone) the answer's own copy stays, without buttons.

const OPEN = new Set(["open", "unconfirmed"]);

const readJson = async <Data,>(url: string, body?: string) => {
  try {
    const response = await fetch(
      url,
      body
        ? {
            body,
            cache: "no-store",
            headers: { "content-type": "application/json" },
            method: "POST",
          }
        : { cache: "no-store" }
    );
    return response.ok ? ((await response.json()) as Data) : null;
  } catch {
    return null;
  }
};

/**
 * What the answer shows, as it is now: read when the answer is there (`url` null until then) and again after each
 * change. Null until read, or when it cannot be.
 */
const useNow = <Data,>(
  url: string | null,
  body?: string
): [Data | null, () => Promise<void>] => {
  const [now, setNow] = useState<Data | null>(null);
  const reread = useCallback(async () => {
    if (url) {
      setNow(await readJson<Data>(url, body));
    }
  }, [url, body]);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (!url) {
        return;
      }
      const data = await readJson<Data>(url, body);
      if (live) {
        setNow(data);
      }
    };
    run();
    return () => {
      live = false;
    };
  }, [url, body]);
  return [now, reread];
};

/** A record that cannot be changed from here: the answer's own copy of it. */
const Frozen = ({
  record: r,
  lead,
}: {
  record: MemoryRecordView;
  lead: string;
}) => {
  const format = useFormatter();
  const zone = useTimeZone() ?? "UTC";
  return (
    <li className="flex flex-col gap-0.5 px-2 py-1.5">
      <span className="text-muted-foreground text-xs tabular-nums">
        {[lead, r.dueAt ? shortDay(r.dueAt, format, zone) : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <span className="text-sm break-words">{r.text}</span>
    </li>
  );
};

/** The open promises first (the urgent on top), then what was closed since the answer. */
const inOrder = (records: MemoryRecordView[], told: Set<string>) => {
  const live = records.filter(
    (r) => r.kind === "commitment" && OPEN.has(r.status ?? "")
  );
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy
  const open = [...live].sort(byUrgency).slice(0, MEMORY_SHOWN);
  const closed = records.filter(
    (r) => told.has(r.id) && !live.includes(r) && r.kind === "commitment"
  );
  return [...open, ...closed];
};

const Open = ({ id }: { id: string }) => {
  const t = useTranslations("chat.memoryShown");
  return (
    <Button
      className="text-muted-foreground"
      nativeButton={false}
      render={<Link href={`/memory?card=${id}`} />}
      size="sm"
      variant="ghost"
    >
      {t("open")} <ArrowUpRight />
    </Button>
  );
};

const More = ({ count }: { count: number }) => {
  const t = useTranslations("chat.memoryShown");
  return count > 0 ? (
    <p className="text-muted-foreground px-3 pb-3 text-xs">
      {t("more", { count })}
    </p>
  ) : null;
};

const Foot = () => {
  const t = useTranslations("chat.memoryShown");
  return (
    <p className="text-muted-foreground px-3 pb-3 text-xs">{t("snapshot")}</p>
  );
};

type Found = Extract<ShowCardOutput, { found: true }>;

/** What is open on the card: «Баланс» and the rest, with the buttons — or, while it cannot be read, the answer's copy. */
const CardBody = ({
  shown,
  now,
  told,
}: {
  shown: Found;
  now: MemoryCard | null;
  told: Set<string>;
}) => {
  const t = useTranslations("chat.memoryShown");
  const m = useTranslations("memory");
  const format = useFormatter();
  const zone = useTimeZone() ?? "UTC";
  const direction = useDirection();
  const data: MemoryCard = now ?? {
    card: shown.card,
    contact: shown.contact,
    records: shown.open,
  };
  const records = now ? inOrder(now.records, told) : shown.open;
  const open = records.filter((r) => OPEN.has(r.status ?? ""));
  const closed = records.filter((r) => !OPEN.has(r.status ?? ""));
  const { mine, others, split, theirs } = sidesOf(data.card, open);
  const day = (iso: string | null) => (iso ? shortDay(iso, format, zone) : "");
  return (
    <div className="@container flex flex-col gap-4 pb-3">
      <Now data={data} timeZone={zone} />
      {now ? (
        <div className="flex flex-col gap-4 px-1">
          <Balance day={day} mine={mine} theirs={theirs} />
          {others.length > 0 && (
            <Section
              count={others.length}
              title={split ? m("otherPromises") : m("commitments")}
            >
              {others.map((r) => (
                <MemoryRecordRow
                  key={r.id}
                  lead={direction(r, data.card.id)}
                  record={r}
                />
              ))}
            </Section>
          )}
          {closed.length > 0 && (
            <Section title={m("closed", { count: closed.length })}>
              {closed.map((r) => (
                <MemoryRecordRow
                  key={r.id}
                  lead={direction(r, data.card.id)}
                  muted
                  record={r}
                />
              ))}
            </Section>
          )}
        </div>
      ) : (
        <ul className="flex flex-col px-1">
          {open.map((r) => (
            <Frozen key={r.id} lead={direction(r, data.card.id)} record={r} />
          ))}
        </ul>
      )}
      {open.length === 0 && closed.length === 0 && (
        <p className="text-muted-foreground px-3 text-sm">{t("nothing")}</p>
      )}
      <More count={shown.moreOpen} />
      {!now && <Foot />}
    </div>
  );
};

/** `show_card`: the person's, organization's or project's card with what is open. */
export const AnswerCard = ({ part }: { part: CardPart }) => {
  const t = useTranslations("chat.memoryShown");
  const zone = useTimeZone() ?? "UTC";
  const output = part.state === "output-available" ? part.output : null;
  const shown = output?.found ? output : null;
  const cardId = shown?.card.id;
  const [now, reread] = useNow<MemoryCard>(
    cardId ? `/api/memory/cards/${cardId}` : null
  );
  const actions = useActionsOf(zone, reread);
  const told = useMemo(() => new Set(shown?.open.map((r) => r.id)), [shown]);
  // Several cards fit, or none: the model asks in words, and there is nothing to draw.
  if (part.state === "output-error" || (output && !shown)) {
    return null;
  }
  return (
    <MemoryActionsContext.Provider value={actions}>
      <WidgetFrame
        actions={cardId && <Open id={cardId} />}
        building={t("buildingCard")}
        streaming={part.state !== "output-available"}
        title={shown?.card.name ?? ""}
      >
        {shown && <CardBody now={now} shown={shown} told={told} />}
      </WidgetFrame>
    </MemoryActionsContext.Provider>
  );
};

/** `show_promises`: the open promises, of everyone or of one card. */
export const AnswerPromises = ({ part }: { part: PromisesPart }) => {
  const t = useTranslations("chat.memoryShown");
  const zone = useTimeZone() ?? "UTC";
  const direction = useDirection();
  const output: ShowPromisesOutput | null =
    part.state === "output-available" ? part.output : null;
  const ids = output?.records.map((r) => r.id) ?? [];
  const [now, reread] = useNow<{ records: MemoryRecordView[] }>(
    output ? "/api/memory/records/lookup" : null,
    JSON.stringify({ ids })
  );
  const actions = useActionsOf(zone, reread);
  if (part.state === "output-error") {
    return null;
  }
  // Deleted since — gone; the order is the answer's.
  const order = new Map(ids.map((id, i) => [id, i]));
  const list = [...(now?.records ?? output?.records ?? [])]
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy (toSorted is past the ES2022 target)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const card = output?.card ?? null;
  const open = list.filter((r) => OPEN.has(r.status ?? "")).length;
  return (
    <MemoryActionsContext.Provider value={actions}>
      <WidgetFrame
        actions={card && <Open id={card.id} />}
        building={t("buildingList")}
        meta={output ? open + output.more : undefined}
        streaming={part.state !== "output-available"}
        title={card ? t("listTitleCard", { name: card.name }) : t("listTitle")}
      >
        {output && (
          <div className="flex flex-col gap-2 px-1 py-2">
            {list.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1 text-sm">
                {t("nothing")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {list.map((r) =>
                  now ? (
                    <MemoryRecordRow
                      key={r.id}
                      lead={direction(r, card?.id)}
                      muted={!OPEN.has(r.status ?? "")}
                      record={r}
                    />
                  ) : (
                    <Frozen
                      key={r.id}
                      lead={direction(r, card?.id)}
                      record={r}
                    />
                  )
                )}
              </ul>
            )}
            <More count={output.more} />
            {!now && <Foot />}
          </div>
        )}
      </WidgetFrame>
    </MemoryActionsContext.Provider>
  );
};
