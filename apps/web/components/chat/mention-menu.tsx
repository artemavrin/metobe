"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { cn } from "@metobe/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { useListHighlight } from "@/components/chat/picker/motion";
import type { NavSource } from "@/components/chat/picker/motion";
import type { Trigger } from "@/components/chat/token-editor";

/**
 * The `@` menu at the caret (P2 «Щелчок»): the servers the user may mention, the highlight travelling with the arrows.
 * A server the user has not connected yet says «Войти» — picking it connects right here; one only the admin can fix
 * says so and cannot be picked. No entrance: it opens on a keystroke, tens of times a day.
 */
export const MentionMenu = ({
  trigger,
  items,
  active,
  box,
  nav,
  onPick,
  onHover,
}: {
  trigger: Trigger;
  items: ChatServer[];
  active: number;
  box: DOMRect;
  nav: React.RefObject<NavSource>;
  onPick: (server: ChatServer) => void;
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
      <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide uppercase">
        {t("menu")}
      </p>
      {items.length === 0 && (
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
      </div>
    </div>
  );
};
