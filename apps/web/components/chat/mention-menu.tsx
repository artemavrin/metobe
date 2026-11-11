"use client";

import type { MemoryCardItem } from "@metobe/contracts/memory";
import type { ChatServer } from "@metobe/core/mcp";
import { cn } from "@metobe/ui/lib/utils";
import { Building2, FolderKanban, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { useListHighlight } from "@/components/chat/picker/motion";
import type { NavSource } from "@/components/chat/picker/motion";
import type { Trigger } from "@/components/chat/token-editor";

/** What the memory card is drawn with in the menu. */
const CARD_ICON = {
  custom: UserRound,
  group: Users,
  org: Building2,
  person: UserRound,
  project: FolderKanban,
} as const;

/** What the card's line says under its name: who they are, and what is open with them. */
const cardHint = (card: MemoryCardItem, open: (count: number) => string) =>
  [
    card.kind === "custom" ? card.type : card.role,
    card.open > 0 && open(card.open),
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * The `@` menu at the caret (P2 «Щелчок»): the servers the user may mention, the highlight travelling with the arrows.
 * A server the user has not connected yet says «Войти» — picking it connects right here; one only the admin can fix
 * says so and cannot be picked. No entrance: it opens on a keystroke, tens of times a day.
 */
export const MentionMenu = ({
  trigger,
  items,
  cards,
  active,
  box,
  nav,
  onPick,
  onPickCard,
  onHover,
}: {
  trigger: Trigger;
  items: ChatServer[];
  /** The memory's cards the query fits (P26 «Одно меню»): after the servers, in the same list. */
  cards: MemoryCardItem[];
  active: number;
  box: DOMRect;
  nav: React.RefObject<NavSource>;
  onPick: (server: ChatServer) => void;
  onPickCard: (card: MemoryCardItem) => void;
  onHover: (i: number) => void;
}) => {
  const t = useTranslations("chat.mcp");
  const list = useRef<HTMLDivElement>(null);
  const { ref: hl } = useListHighlight({ container: list, source: nav });
  return (
    <div
      className="bg-popover text-popover-foreground ring-foreground/10 absolute z-30 w-80 rounded-xl p-1 shadow-lg ring-1"
      id="mention-menu"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a menu at the caret with its own highlight; a <select> cannot be one
      role="listbox"
      style={{
        bottom: box.bottom - trigger.rect.top + 6,
        left: Math.max(
          8,
          Math.min(trigger.rect.left - box.left - 8, box.width - 328)
        ),
      }}
    >
      {(items.length > 0 || cards.length === 0) && (
        <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide uppercase">
          {t("menu")}
        </p>
      )}
      {items.length === 0 && cards.length === 0 && (
        <p className="text-muted-foreground px-2 py-3 text-sm">{t("none")}</p>
      )}
      <div className="relative" ref={list}>
        <div
          aria-hidden
          className="bg-accent pointer-events-none absolute inset-x-0 top-0 rounded-lg opacity-0"
          ref={hl}
        />
        {items.map((server, i) => {
          const blocked = server.signIn === "admin";
          let hint = t("tools", { count: server.toolCount });
          if (server.signIn === "self") {
            hint = t("signIn");
          } else if (blocked) {
            hint = t("adminOnly");
          }
          return (
            <button
              aria-disabled={blocked}
              aria-selected={i === active}
              className={cn(
                "relative z-[1] flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
                blocked && "opacity-50"
              )}
              id={`mention-${server.id}`}
              key={server.id}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!blocked) {
                  onPick(server);
                }
              }}
              onPointerMove={() => {
                if (i !== active) {
                  nav.current = "step";
                  onHover(i);
                }
              }}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the caret menu above, with a picture and a hint
              role="option"
              type="button"
            >
              <BrandLogo
                label={server.title}
                logo={server.logo ?? undefined}
                size={24}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{server.title}</span>
                <span
                  className={cn(
                    "truncate text-xs",
                    server.signIn === "self"
                      ? "text-sky-700 dark:text-sky-300"
                      : "text-muted-foreground"
                  )}
                >
                  {hint}
                </span>
              </span>
            </button>
          );
        })}
        {cards.length > 0 && (
          <p
            className={cn(
              "text-muted-foreground px-2 pb-1.5 text-[11px] font-medium tracking-wide uppercase",
              items.length > 0 ? "pt-2.5" : "pt-1"
            )}
          >
            {t("memory")}
          </p>
        )}
        {cards.map((card, n) => {
          const i = items.length + n;
          const Icon = CARD_ICON[card.kind];
          const hint = cardHint(card, (count) => t("cardOpen", { count }));
          return (
            <button
              aria-selected={i === active}
              className="relative z-[1] flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm"
              id={`mention-${card.id}`}
              key={card.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onPickCard(card);
              }}
              onPointerMove={() => {
                if (i !== active) {
                  nav.current = "step";
                  onHover(i);
                }
              }}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the caret menu above, with a picture and a hint
              role="option"
              type="button"
            >
              <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
                <Icon className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{card.name}</span>
                {hint && (
                  <span className="text-muted-foreground truncate text-xs">
                    {hint}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
