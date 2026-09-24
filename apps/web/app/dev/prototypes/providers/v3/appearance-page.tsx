"use client";

// «Внешний вид»: the user's theme. Three tiles with a miniature of the app instead of a dropdown; applies at once.
import { cn } from "@metobe/ui/lib/utils";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Section } from "./parts";

const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;

/** A tiny app: sidebar, a few lines, a composer. Colours are fixed, so each tile shows its own theme. */
const Miniature = ({ dark }: { dark: boolean }) => (
  <div className={cn("flex h-full w-full gap-1.5 p-2", dark ? "bg-zinc-900" : "bg-white")}>
    <div className={cn("flex w-1/4 flex-col gap-1 rounded-md p-1.5", dark ? "bg-zinc-800" : "bg-zinc-100")}>
      <span className={cn("h-1.5 w-3/4 rounded-full", dark ? "bg-zinc-600" : "bg-zinc-300")} />
      <span className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-zinc-700" : "bg-zinc-200")} />
      <span className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-zinc-700" : "bg-zinc-200")} />
    </div>
    <div className="flex flex-1 flex-col justify-end gap-1.5">
      <span className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-zinc-700" : "bg-zinc-200")} />
      <span className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-zinc-700" : "bg-zinc-200")} />
      <span className={cn("h-4 rounded-md border", dark ? "border-zinc-700 bg-zinc-800" : "border-zinc-200 bg-white")} />
    </div>
  </div>
);

const THEMES = [
  { id: "light", label: "Светлая" },
  { id: "dark", label: "Тёмная" },
  { id: "system", label: "Как в системе" },
] as const;

export const AppearancePage = () => {
  const { theme, setTheme } = useTheme();
  // next-themes knows the choice only in the browser; render the tiles unselected until then.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Внешний вид</h1>
        <p className="text-muted-foreground">Тема интерфейса. Меняется только у вас и сразу.</p>
      </header>
      <Section title="Тема">
        <div className="grid grid-cols-3 gap-3" role="radiogroup">
          {THEMES.map((t) => {
            const on = mounted && theme === t.id;
            return (
              <button
                aria-checked={on}
                className="group flex flex-col gap-2 text-left transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]"
                key={t.id}
                onClick={() => setTheme(t.id)}
                role="radio"
                type="button"
              >
                <span
                  className={cn(
                    "relative aspect-[4/3] overflow-hidden rounded-lg ring-1 transition-shadow duration-150",
                    on ? "ring-primary ring-2" : "ring-border group-hover:ring-foreground/30"
                  )}
                >
                  {t.id === "system" ? (
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
                    <Miniature dark={t.id === "dark"} />
                  )}
                  {on && (
                    <span className="bg-primary text-primary-foreground v3-pop absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full">
                      <Check className="size-3" />
                    </span>
                  )}
                </span>
                <span className={cn("text-sm", on ? "font-medium" : "text-muted-foreground")}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
};
