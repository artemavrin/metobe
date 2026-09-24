"use client";

// Pieces shared by the settings sections: section and settings rows, an edit-in-place value, a list row.
import { Button } from "@purr/ui/components/button";
import { Input } from "@purr/ui/components/input";
import { cn } from "@purr/ui/lib/utils";
import { type ReactNode, useState } from "react";

import { NO_AUTOFILL } from "../../_p7/shared";

export const Section = ({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold">
        {title}
        {meta && <span className="text-muted-foreground ml-2 font-normal">{meta}</span>}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

export const Row = ({ label, hint, children, action }: { label: string; hint?: string; children: ReactNode; action?: ReactNode }) => (
  <div className="grid min-h-14 grid-cols-[180px_1fr_auto] items-center gap-4 px-4 py-3">
    <div className="flex flex-col">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
    <div className="min-w-0">{children}</div>
    <div>{action}</div>
  </div>
);

/**
 * A settings row whose value is edited in place: «Изменить» turns the value into a field, Enter saves, Esc cancels
 * without leaving settings. `check` explains why a value can't be saved, before any request.
 */
export const EditRow = ({
  label,
  hint,
  value,
  placeholder,
  mono = true,
  startOpen = false,
  check,
  onSave,
  display,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  startOpen?: boolean;
  check?: (v: string) => string | null;
  onSave: (v: string) => void;
  display?: ReactNode;
}) => {
  const [open, setOpen] = useState(startOpen);
  const [draft, setDraft] = useState(value);
  const [tried, setTried] = useState(false);
  const problem = check?.(draft.trim()) ?? null;
  const save = () => {
    setTried(true);
    if (problem || !draft.trim()) return;
    onSave(draft.trim());
    setOpen(false);
  };
  const cancel = () => {
    setDraft(value);
    setTried(false);
    setOpen(false);
  };
  return (
    <Row
      action={
        open ? (
          <span className="flex gap-1">
            {value && (
              <Button onClick={cancel} size="sm" variant="ghost">
                Отмена
              </Button>
            )}
            <Button onClick={save} size="sm">
              Сохранить
            </Button>
          </span>
        ) : (
          <Button
            onClick={() => {
              setDraft(value);
              setOpen(true);
            }}
            size="sm"
            variant="ghost"
          >
            Изменить
          </Button>
        )
      }
      hint={hint}
      label={label}
    >
      {open ? (
        <div className="flex flex-col gap-1">
          <Input
            {...NO_AUTOFILL}
            aria-invalid={tried && Boolean(problem)}
            autoFocus
            className={cn("max-w-md", mono && "font-mono")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                e.stopPropagation();
                cancel();
              }
            }}
            placeholder={placeholder}
            value={draft}
          />
          {tried && problem && <span className="text-destructive text-xs">{problem}</span>}
        </div>
      ) : (
        (display ?? <span className={cn("truncate", mono && "font-mono")}>{value || <span className="text-muted-foreground">не задан</span>}</span>)
      )}
    </Row>
  );
};

/** One row of a list → detail sidebar. */
export const ListRow = ({ active, onClick, media, title, sub, trail }: { active: boolean; onClick: () => void; media: ReactNode; title: ReactNode; sub: ReactNode; trail?: ReactNode }) => (
  <button
    className={cn(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,transform] duration-150 ease-out active:scale-[0.99]",
      active ? "bg-muted" : "hover:bg-muted/50"
    )}
    onClick={onClick}
    type="button"
  >
    {media}
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium">{title}</span>
      <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">{sub}</span>
    </span>
    {trail}
  </button>
);
