"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Section } from "@/components/settings/rows";

const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;

/** A tiny app — sidebar, lines, a composer — in fixed colours, so each tile shows its own theme. */
const Miniature = ({ dark }: { dark: boolean }) => (
  <span
    className={cn(
      "flex h-full w-full gap-1.5 p-2",
      dark ? "bg-zinc-900" : "bg-white"
    )}
  >
    <span
      className={cn(
        "flex w-1/4 flex-col gap-1 rounded-md p-1.5",
        dark ? "bg-zinc-800" : "bg-zinc-100"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-3/4 rounded-full",
          dark ? "bg-zinc-600" : "bg-zinc-300"
        )}
      />
      <span
        className={cn(
          "h-1.5 w-1/2 rounded-full",
          dark ? "bg-zinc-700" : "bg-zinc-200"
        )}
      />
      <span
        className={cn(
          "h-1.5 w-2/3 rounded-full",
          dark ? "bg-zinc-700" : "bg-zinc-200"
        )}
      />
    </span>
    <span className="flex flex-1 flex-col justify-end gap-1.5">
      <span
        className={cn(
          "h-1.5 w-2/3 rounded-full",
          dark ? "bg-zinc-700" : "bg-zinc-200"
        )}
      />
      <span
        className={cn(
          "h-1.5 w-1/2 rounded-full",
          dark ? "bg-zinc-700" : "bg-zinc-200"
        )}
      />
      <span
        className={cn(
          "h-4 rounded-md border",
          dark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-white"
        )}
      />
    </span>
  </span>
);

const THEMES = ["light", "dark", "system"] as const;

/** Three tiles instead of a dropdown; the theme applies at once (kept in this browser by next-themes). */
export const ThemePicker = () => {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();
  // The choice is known only in the browser; tiles render unselected until then.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  return (
    <Section title={t("theme")}>
      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="sr-only">{t("theme")}</legend>
        {THEMES.map((id) => {
          const on = mounted && theme === id;
          return (
            <label
              className="group flex cursor-pointer flex-col gap-2 text-left transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] motion-reduce:active:scale-100"
              key={id}
            >
              <input
                checked={on}
                className="peer sr-only"
                name="theme"
                onChange={() => setTheme(id)}
                type="radio"
                value={id}
              />
              <span
                className={cn(
                  "peer-focus-visible:outline-ring relative aspect-[4/3] overflow-hidden rounded-lg ring-1 transition-shadow duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                  on
                    ? "ring-primary ring-2"
                    : "ring-border group-hover:ring-foreground/30"
                )}
              >
                {id === "system" ? (
                  <span className="absolute inset-0 flex">
                    <span className="w-1/2 overflow-hidden">
                      <span className="block h-full w-[200%]">
                        <Miniature dark={false} />
                      </span>
                    </span>
                    <span className="w-1/2 overflow-hidden">
                      <span className="-ml-[100%] block h-full w-[200%]">
                        <Miniature dark />
                      </span>
                    </span>
                  </span>
                ) : (
                  <Miniature dark={id === "dark"} />
                )}
                {on && (
                  <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full">
                    <Check className="size-3" />
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  on ? "font-medium" : "text-muted-foreground"
                )}
              >
                {t(id)}
              </span>
            </label>
          );
        })}
      </fieldset>
    </Section>
  );
};
