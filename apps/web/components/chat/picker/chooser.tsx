"use client";

import { Kbd } from "@metobe/ui/components/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { BrandLogo } from "@/components/brand-logo";

import { usePickerData } from "./data";
import type { Favorites, PickerModel } from "./data";
import { FavoritesPicker } from "./favorites";
import { EASE_OUT, SNAP } from "./motion";
import { ModelPalette } from "./palette";
import type { PaletteOpening } from "./palette";

type Dir = -1 | 0 | 1;

// The chip's name rolls to the next model: down when the picked row is below the current one, up when above.
const roll = {
  center: { filter: "blur(0px)", opacity: 1, transform: "translateY(0%)" },
  enter: (d: Dir) => ({
    filter: "blur(2px)",
    opacity: 0,
    transform: `translateY(${(d || 1) * 100}%)`,
  }),
  exit: (d: Dir) => ({
    filter: "blur(2px)",
    opacity: 0,
    transform: `translateY(${-(d || 1) * 100}%)`,
    transition: { duration: 0.15, ease: EASE_OUT },
  }),
};
// ⌘1–9 can happen a hundred times a day: no travel, only a quick fade.
const fade = {
  center: { filter: "blur(0px)", opacity: 1, transform: "translateY(0%)" },
  enter: () => ({
    filter: "blur(2px)",
    opacity: 0,
    transform: "translateY(0%)",
  }),
  exit: () => ({
    filter: "blur(0px)",
    opacity: 0,
    transform: "translateY(0%)",
    transition: { duration: 0.1, ease: EASE_OUT },
  }),
};

const ChipContent = ({
  model,
  dir,
  mode,
}: {
  model: PickerModel;
  dir: Dir;
  mode: "roll" | "fade";
}) => {
  const [width, setWidth] = useState<number | undefined>();
  // The hidden copy remounts with each model and measures itself — rounded up: offsetWidth rounds down and the last
  // letter would turn into an ellipsis.
  const measure = useCallback((el: HTMLSpanElement | null) => {
    if (el) {
      setWidth(Math.ceil(el.getBoundingClientRect().width) + 1);
    }
  }, []);
  const variants = mode === "roll" ? roll : fade;
  return (
    <>
      {model.logo && (
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ filter: "blur(0px)", opacity: 1, transform: "scale(1)" }}
            className="flex"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            initial={
              mode === "roll"
                ? { filter: "blur(2px)", opacity: 0, transform: "scale(0.9)" }
                : { opacity: 0 }
            }
            key={model.id}
            transition={{
              duration: mode === "roll" ? 0.2 : 0.15,
              ease: EASE_OUT,
            }}
          >
            <BrandLogo
              label={model.makerTitle}
              logo={model.logo}
              size={18}
              tile={false}
            />
          </motion.span>
        </AnimatePresence>
      )}
      <motion.span
        animate={{ width }}
        className="relative inline-flex h-5 max-w-[180px] items-center overflow-hidden"
        initial={false}
        transition={mode === "roll" ? { duration: 0.2, ease: EASE_OUT } : SNAP}
      >
        <AnimatePresence custom={dir} initial={false} mode="popLayout">
          <motion.span
            animate="center"
            className="truncate whitespace-nowrap"
            custom={dir}
            exit="exit"
            initial="enter"
            key={model.id}
            transition={{
              duration: mode === "roll" ? 0.2 : 0.15,
              ease: EASE_OUT,
            }}
            variants={variants}
          >
            {model.title}
          </motion.span>
        </AnimatePresence>
      </motion.span>
      <span
        aria-hidden
        className="invisible absolute -z-10 whitespace-nowrap"
        key={model.id}
        ref={measure}
      >
        {model.title}
      </span>
    </>
  );
};

/**
 * Choosing the model (P3 «Щелчок»): the chip opens the favorites picker, ⌘/ opens the palette from anywhere, ⌘1–9
 * from the composer take the n-th favorite. `onDone` gives the focus back to the text.
 */
export const ModelChooser = ({
  model,
  favorites,
  onChange,
  onDone,
}: {
  model: PickerModel;
  favorites: Favorites;
  onChange: (m: PickerModel) => void;
  onDone: () => void;
}) => {
  const t = useTranslations("chat.picker");
  const { byId } = usePickerData();
  const [picker, setPicker] = useState(false);
  const [palette, setPalette] = useState(false);
  const [opening, setOpening] = useState<PaletteOpening>({ via: "key" });
  const [chip, setChip] = useState<{ dir: Dir; mode: "roll" | "fade" }>({
    dir: 1,
    mode: "roll",
  });
  /** The chip's hint; never while its picker is open. */
  const [chipTip, setChipTip] = useState(false);
  /** Leaving the picker for the palette: the picker vanishes at once, no exit. */
  const [pickerInstantClose, setPickerInstantClose] = useState(false);
  /** The picker is closing because the palette opens: it must not hand the focus back to the text. */
  const toPalette = useRef(false);

  const choose = useCallback(
    (m: PickerModel, dir: Dir, mode: "roll" | "fade" = "roll") => {
      setChip({ dir, mode });
      onChange(m);
    },
    [onChange]
  );
  const openPalette = useCallback((o: PaletteOpening) => {
    toPalette.current = true;
    setPickerInstantClose(true);
    setPicker(false);
    setOpening(o);
    setPalette(true);
  }, []);

  // ⌘/ from anywhere, by the physical key (works on ЙЦУКЕН too), toggles the palette; ⌘1–9 pick a favorite.
  const latest = useRef({ byId, choose, favorites, openPalette, palette });
  useLayoutEffect(() => {
    latest.current = { byId, choose, favorites, openPalette, palette };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) {
        return;
      }
      const l = latest.current;
      if (e.code === "Slash") {
        e.preventDefault();
        if (l.palette) {
          setPalette(false);
        } else {
          l.openPalette({ via: "key" });
        }
        return;
      }
      // Inside the picker and the palette their own handlers take the digits.
      const n = /^Digit(?<n>[1-9])$/u.exec(e.code)?.groups?.n;
      const target = e.target as HTMLElement;
      if (n && !e.shiftKey && target.closest("form[data-composer]")) {
        const m = l.byId(l.favorites.ids[Number(n) - 1] ?? "");
        if (m) {
          e.preventDefault();
          l.choose(m, 0, "fade");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Popover
        onOpenChange={(o) => {
          if (o) {
            setPickerInstantClose(false);
            toPalette.current = false;
          }
          setPicker(o);
        }}
        open={picker}
      >
        <Tooltip onOpenChange={(o) => setChipTip(o)} open={chipTip && !picker}>
          <TooltipTrigger
            delay={600}
            render={
              <PopoverTrigger
                render={
                  <button
                    aria-label={t("chipLabel", { title: model.title })}
                    className={cn(
                      "group/chip relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm",
                      "hover:bg-muted data-[popup-open]:bg-muted active:scale-[0.97]",
                      "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease] motion-reduce:active:scale-100"
                    )}
                    type="button"
                  />
                }
              />
            }
          >
            <ChipContent dir={chip.dir} mode={chip.mode} model={model} />
            <ChevronDown className="size-3.5 opacity-50 transition-[rotate] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[popup-open]/chip:rotate-180 motion-reduce:transition-none" />
          </TooltipTrigger>
          <TooltipContent>
            {t("chipTip")} <Kbd>⌘/</Kbd>
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          className={cn(
            "data-[side=top]:slide-in-from-bottom-0 w-72 gap-0 rounded-[14px] p-1 duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-closed:duration-100 data-[instant]:animate-none",
            "motion-reduce:zoom-in-100 motion-reduce:zoom-out-100",
            pickerInstantClose && "data-closed:animate-none"
          )}
          finalFocus={() => {
            // Leaving for the palette: its search keeps the focus; the text gets it back when the palette closes.
            if (!toPalette.current) {
              requestAnimationFrame(onDone);
            }
            return false;
          }}
          side="top"
          sideOffset={8}
        >
          <FavoritesPicker
            current={model}
            favorites={favorites}
            onClose={() => setPicker(false)}
            onOpenPalette={openPalette}
            onPick={(m, dir) => {
              setPicker(false);
              choose(m, dir);
            }}
            open={picker}
          />
        </PopoverContent>
      </Popover>
      <ModelPalette
        current={model}
        favorites={favorites}
        onClosed={() => requestAnimationFrame(onDone)}
        onOpenChange={(o) => {
          if (!o) {
            toPalette.current = false;
          }
          setPalette(o);
        }}
        onPick={(m, dir) => {
          toPalette.current = false;
          setPalette(false);
          choose(m, dir);
        }}
        open={palette}
        opening={opening}
      />
    </>
  );
};
