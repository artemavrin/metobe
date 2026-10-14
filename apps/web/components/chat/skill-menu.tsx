"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { useListHighlight } from "@/components/chat/picker/motion";
import type { NavSource } from "@/components/chat/picker/motion";
import type { Trigger } from "@/components/chat/token-editor";

/** A skill as the composer offers it. */
export interface ChatSkill {
  id: string;
  name: string;
  description: string;
  /** The organization's, not the user's own. */
  shared: boolean;
}

/**
 * The `/` menu at the caret: the skills the user may pick, the same build as the `@` menu — the highlight travels
 * with the arrows, Enter or Tab picks. It opens only while something matches: a `/` typed in plain words stays text.
 */
export const SkillMenu = ({
  trigger,
  items,
  active,
  box,
  nav,
  onPick,
  onHover,
}: {
  trigger: Trigger;
  items: ChatSkill[];
  active: number;
  box: DOMRect;
  nav: React.RefObject<NavSource>;
  onPick: (skill: ChatSkill) => void;
  onHover: (i: number) => void;
}) => {
  const t = useTranslations("chat.skills");
  const list = useRef<HTMLDivElement>(null);
  const { ref: hl } = useListHighlight({ container: list, source: nav });
  return (
    <div
      className="bg-popover text-popover-foreground ring-foreground/10 absolute z-30 w-80 rounded-xl p-1 shadow-lg ring-1"
      id="skill-menu"
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
      <div className="relative max-h-72 overflow-y-auto" ref={list}>
        <div
          aria-hidden
          className="bg-accent pointer-events-none absolute inset-x-0 top-0 rounded-lg opacity-0"
          ref={hl}
        />
        {items.map((skill, i) => (
          <button
            aria-selected={i === active}
            className="relative z-[1] flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm"
            id={`skill-${skill.id}`}
            key={skill.id}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(skill);
            }}
            onPointerMove={() => {
              if (i !== active) {
                nav.current = "step";
                onHover(i);
              }
            }}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the caret menu above
            role="option"
            type="button"
          >
            <span className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5">
              <Sparkles />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">
                /{skill.name}
                {skill.shared && (
                  <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                    {t("shared")}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground line-clamp-2 text-xs">
                {skill.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
