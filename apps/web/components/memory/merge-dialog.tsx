"use client";

import type { MemoryCard, MemoryCardItem } from "@metobe/contracts/memory";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Input } from "@metobe/ui/components/input";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, Ellipsis, Merge } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Avatar } from "./card-parts";
import { useMemoryStore } from "./memory-store";
import { readJson } from "./use-memory-actions";

// «Объединить с…» (§19.8.5, P19): two cards of one kind into one. Pick the other card from the list of that kind (a
// search narrows it), see both side by side — what each holds — choose whose name stays, and merge. The records, the
// other names and «Убрать» go to the kept card; «Вернуть» in the toast takes it all back.

const normalize = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

/** The cards of the same kind that fit the words: by name, other name or role. */
const fitting = (
  cards: MemoryCardItem[],
  from: MemoryCardItem,
  query: string
) => {
  const words = normalize(query).split(/\s+/u).filter(Boolean);
  return cards.filter(
    (c) =>
      c.id !== from.id &&
      c.kind === from.kind &&
      words.every((w) =>
        normalize(
          [c.name, ...c.aliases, c.role ?? "", c.type ?? ""].join(" ")
        ).includes(w)
      )
  );
};

/** One of the two cards in the preview: who, what it holds, and the choice to keep its name. */
const Side = ({
  card,
  records,
  kept,
  onKeep,
}: {
  card: MemoryCardItem;
  records: number | null;
  kept: boolean;
  onKeep: () => void;
}) => {
  const t = useTranslations("memory");
  return (
    <button
      aria-pressed={kept}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors duration-150",
        kept ? "border-foreground/40 bg-muted/50" : "hover:bg-muted/30"
      )}
      onClick={onKeep}
      type="button"
    >
      <Avatar kind={card.kind} name={card.name} />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium break-words">{card.name}</span>
        {(card.role ?? card.type) && (
          <span className="text-muted-foreground text-xs break-words">
            {card.role ?? card.type}
          </span>
        )}
      </span>
      <span className="text-muted-foreground text-xs">
        {t("mergeCounts", { open: card.open, records: records ?? 0 })}
      </span>
      <span
        className={cn(
          "text-xs font-medium",
          kept ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {kept ? t("mergeKept") : t("mergeKeep")}
      </span>
    </button>
  );
};

export const MergeDialog = ({
  card,
  open,
  onClose,
}: {
  card: MemoryCardItem;
  open: boolean;
  onClose: () => void;
}) => {
  const t = useTranslations("memory");
  const { actions, overview, setPick } = useMemoryStore();
  const [query, setQuery] = useState("");
  const [other, setOther] = useState<MemoryCardItem | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [keepOther, setKeepOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const found = useMemo(
    () => fitting(overview?.cards ?? [], card, query),
    [overview, card, query]
  );

  // The records each of the two holds, for the preview; the one with more is kept by default.
  useEffect(() => {
    if (!other) {
      return;
    }
    let live = true;
    const read = async () => {
      const [mine, theirs] = await Promise.all([
        readJson<MemoryCard>(`/api/memory/cards/${card.id}`),
        readJson<MemoryCard>(`/api/memory/cards/${other.id}`),
      ]);
      if (!live) {
        return;
      }
      const have = {
        [card.id]: mine?.records.length ?? 0,
        [other.id]: theirs?.records.length ?? 0,
      };
      setCounts(have);
      const more = (have[other.id] ?? 0) - (have[card.id] ?? 0);
      setKeepOther(
        more > 0 || (more === 0 && other.name.length > card.name.length)
      );
    };
    read();
    return () => {
      live = false;
    };
  }, [other, card]);

  const close = () => {
    setQuery("");
    setOther(null);
    setCounts({});
    onClose();
  };
  const merge = async () => {
    if (!other || busy) {
      return;
    }
    const keep = keepOther ? other : card;
    const gone = keepOther ? card : other;
    setBusy(true);
    const done = await actions.merge(gone.id, { id: keep.id, name: keep.name });
    setBusy(false);
    if (done) {
      setPick({ id: keep.id, type: "card" });
      close();
    }
  };
  const keep = other && keepOther ? other : card;
  const gone = other && keepOther ? card : other;
  const total = (counts[card.id] ?? 0) + (other ? (counts[other.id] ?? 0) : 0);

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("mergeTitle", { name: card.name })}</DialogTitle>
          <DialogDescription>{t("mergeHint")}</DialogDescription>
        </DialogHeader>
        {other ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 max-sm:flex-col">
              <Side
                card={card}
                kept={!keepOther}
                onKeep={() => setKeepOther(false)}
                records={counts[card.id] ?? null}
              />
              <Side
                card={other}
                kept={keepOther}
                onKeep={() => setKeepOther(true)}
                records={counts[other.id] ?? null}
              />
            </div>
            {gone && (
              <p className="text-muted-foreground text-sm">
                {t("mergeResult", {
                  alias: gone.name,
                  name: keep.name,
                  records: total,
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              aria-label={t("mergeSearch")}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("mergeSearch")}
              type="search"
              value={query}
            />
            <div className="flex max-h-64 flex-col overflow-y-auto">
              {found.length === 0 && (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  {t("mergeNone")}
                </p>
              )}
              {found.map((c) => (
                <button
                  className="hover:bg-muted/60 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150"
                  key={c.id}
                  onClick={() => setOther(c)}
                  type="button"
                >
                  <Avatar kind={c.kind} name={c.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{c.name}</span>
                    {(c.role ?? c.type) && (
                      <span className="text-muted-foreground truncate text-xs">
                        {c.role ?? c.type}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          {other ? (
            <Button
              disabled={busy}
              onClick={() => setOther(null)}
              type="button"
              variant="outline"
            >
              <ArrowLeft /> {t("back")}
            </Button>
          ) : (
            <Button onClick={close} type="button" variant="outline">
              {t("cancelNew")}
            </Button>
          )}
          <Button disabled={!other || busy} onClick={merge} type="button">
            {t("mergeAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The card's «⋯»: what is done with the card as a whole — for now, «Объединить с…». The person's own card has none. */
export const CardMenu = ({ card }: { card: MemoryCardItem }) => {
  const t = useTranslations("memory");
  const [merging, setMerging] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("cardActions")}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setMerging(true)}>
            <Merge /> {t("mergeWith")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MergeDialog
        card={card}
        onClose={() => setMerging(false)}
        open={merging}
      />
    </>
  );
};
