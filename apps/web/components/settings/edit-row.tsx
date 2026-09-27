"use client";

import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { Row } from "@/components/settings/rows";

/** A row whose value opens into an editor under it: the field, «Отмена», the main action, the error below. */
export const EditRow = ({
  label,
  hint,
  value,
  editor,
  onSave,
  action,
  primary,
  defaultOpen = false,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  /** The field(s); Enter inside saves, Esc cancels. */
  editor: ReactNode;
  /** Returns what went wrong, or null — then the editor closes. */
  onSave: () => Promise<string | null>;
  /** The button that opens the editor; «Изменить» by default. */
  action?: string;
  /** The main action; «Сохранить» by default. */
  primary?: string;
  /** Open from the start — when fixing it is the one thing to do. */
  defaultOpen?: boolean;
}) => {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Esc inside the editor cancels it; captured first, so the settings shell doesn't close on the same key.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && formRef.current?.contains(e.target as Node)) {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const problem = await onSave();
      if (problem) {
        setError(problem);
      } else {
        setOpen(false);
      }
    });
  return (
    <div>
      <Row
        action={
          !open && (
            <Button onClick={() => setOpen(true)} size="sm" variant="ghost">
              {action ?? t("edit")}
            </Button>
          )
        }
        hint={hint}
        label={label}
      >
        {value}
      </Row>
      {open && (
        // A form: Enter in a field saves; Esc cancels without closing settings.
        <form
          ref={formRef}
          className="animate-in fade-in fill-mode-both flex flex-col gap-2 px-4 pb-4 duration-150"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) {
              submit();
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 basis-full flex-wrap gap-2 sm:flex-1 sm:basis-auto">
              {editor}
            </div>
            {!pending && (
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                {t("cancel")}
              </Button>
            )}
            <Button aria-disabled={pending} type="submit">
              {pending && <Spinner />}
              {primary ?? t("save")}
            </Button>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </form>
      )}
    </div>
  );
};
