"use client";

import { localeNames, locales } from "@metobe/i18n/config";
import { cn } from "@metobe/ui/lib/utils";
import { useLocale } from "next-intl";
import { useTransition } from "react";

import { setLocale } from "@/lib/prefs-actions";

/**
 * Language for pages without a profile yet (sign-in, claim): every language named in itself, in one quiet row.
 * With two or three languages a menu would only hide them; past five this becomes a menu in the same place.
 */
export const LanguageSwitch = ({ className }: { className?: string }) => {
  const current = useLocale();
  const [pending, start] = useTransition();
  return (
    <fieldset
      className={cn(
        "m-0 flex items-center gap-1 border-0 p-0 text-xs",
        className
      )}
    >
      <legend className="sr-only">Language</legend>
      {locales.map((l, i) => (
        <span className="flex items-center gap-1" key={l}>
          {i > 0 && <span className="text-muted-foreground/40">·</span>}
          <button
            aria-pressed={current === l}
            className={cn(
              "rounded px-1 py-0.5 transition-colors duration-150 disabled:opacity-60",
              current === l
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
            disabled={pending}
            lang={l}
            onClick={() => current !== l && start(() => setLocale(l))}
            type="button"
          >
            {localeNames[l]}
          </button>
        </span>
      ))}
    </fieldset>
  );
};
