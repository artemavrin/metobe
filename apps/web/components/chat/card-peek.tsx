"use client";

import type { MemoryCard } from "@metobe/contracts/memory";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

const SHOWN = 3;
const OPEN = new Set(["open", "unconfirmed"]);

/**
 * A card's name in a sent question (Д5): the pointer on it opens a small card — who they are, what is open with them,
 * the last contact. Read from the page's own `GET /api/memory/cards/[id]` the first time it opens. The look is the
 * rich tooltip's: the sidebar's ground, no tail, the pointer can reach it. A phone has no pointer: the badge only
 * shows the name there.
 */
export const CardPeek = ({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) => {
  const t = useTranslations("chat.mcp");
  const memory = useTranslations("memory");
  const format = useFormatter();
  const [data, setData] = useState<MemoryCard | "gone" | null>(null);
  const asked = useRef(false);
  const read = async () => {
    try {
      const response = await fetch(`/api/memory/cards/${id}`, {
        cache: "no-store",
      });
      setData(response.ok ? ((await response.json()) as MemoryCard) : "gone");
    } catch {
      setData("gone");
    }
  };
  const open =
    data && data !== "gone"
      ? data.records.filter(
          (r) => r.kind === "commitment" && OPEN.has(r.status ?? "")
        )
      : [];
  const card = data && data !== "gone" ? data.card : null;
  const last = data && data !== "gone" ? data.contact?.last : null;
  return (
    <Tooltip
      onOpenChange={(opened) => {
        if (opened && !asked.current) {
          asked.current = true;
          read();
        }
      }}
    >
      <TooltipTrigger delay={250} render={<span />}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        arrow={false}
        className="bg-sidebar text-foreground ring-foreground/10 max-w-72 flex-col items-start gap-1.5 rounded-xl px-3 py-2.5 text-sm shadow-md ring-1"
        sideOffset={8}
      >
        {data === "gone" && (
          <span className="text-muted-foreground">{t("peekGone")}</span>
        )}
        {data === null && (
          <span className="text-muted-foreground">{t("peekLoading")}</span>
        )}
        {card && (
          <>
            <Link
              className="font-medium underline-offset-2 hover:underline"
              href={`/memory?card=${card.id}`}
            >
              {card.name}
            </Link>
            {(card.kind === "custom" ? card.type : card.role) && (
              <span className="text-muted-foreground text-xs">
                {card.kind === "custom" ? card.type : card.role}
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              {memory("counts", { open: card.open, overdue: card.overdue })}
            </span>
            {open.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-xs">
                {open.slice(0, SHOWN).map((r) => (
                  <li className="line-clamp-2" key={r.id}>
                    {r.text}
                  </li>
                ))}
              </ul>
            )}
            {last && (
              <span className="text-muted-foreground text-xs">
                {t("peekLast", {
                  date: format.dateTime(new Date(last), {
                    day: "numeric",
                    month: "short",
                  }),
                })}
              </span>
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
};
