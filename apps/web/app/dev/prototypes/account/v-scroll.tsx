"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useEffect, useState } from "react";

import { Section } from "@/components/settings/rows";
import { SettingsPageFrame } from "@/components/settings/settings-shell";

import {
  DangerRows,
  DevicesRows,
  ExportRows,
  Header,
  LookBody,
  ModelBody,
  RegionRows,
  RevokeOthers,
} from "./parts";

// «Лента»: the whole account on one page, the header on top and the sections one under another, with a rail of
// anchors at the side (a strip of chips on a phone) that follows the reading. Nothing is hidden; everything is a scroll.

const SECTIONS = [
  { id: "look", title: "Внешний вид" },
  { id: "region", title: "Язык и регион" },
  { id: "model", title: "Сведения для модели" },
  { id: "devices", title: "Активные сеансы" },
  { id: "data", title: "Данные" },
] as const;

/**
 * The section being read: the last whose top has passed a line just under the top edge. Measured on scroll, not by
 * intersection — the last sections are short and would never reach a band, so the page keeps room at its end for them.
 */
const useActive = () => {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // A section counts as read once its top is near the top edge — where a click on the rail puts it.
      const line = 112;
      let current: string = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const top = document.getElementById(s.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = s.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return active;
};

const go = (id: string) =>
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });

export const Scroll = () => {
  const active = useActive();
  return (
    <SettingsPageFrame>
      <Header />
      {/* A phone: chips that stay under the top edge */}
      <nav
        aria-label="Разделы"
        className="bg-background/90 sticky top-0 z-10 -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2 backdrop-blur md:hidden"
      >
        {SECTIONS.map((s) => (
          <button
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm transition-colors duration-150",
              active === s.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
            key={s.id}
            onClick={() => go(s.id)}
            type="button"
          >
            {s.title}
          </button>
        ))}
      </nav>
      <div className="grid gap-10 md:grid-cols-[10.5rem_1fr]">
        <nav
          aria-label="Разделы"
          className="sticky top-8 hidden h-fit flex-col gap-0.5 md:flex"
        >
          {SECTIONS.map((s) => (
            <button
              aria-current={active === s.id ? "location" : undefined}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-left text-sm transition-[background-color,color] duration-150",
                active === s.id
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
              key={s.id}
              onClick={() => go(s.id)}
              type="button"
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-10">
          <div className="scroll-mt-8" id="look">
            <Section title="Внешний вид">
              <LookBody />
            </Section>
          </div>
          <div className="scroll-mt-8" id="region">
            <Section title="Язык и регион">
              <RegionRows />
            </Section>
          </div>
          <div className="scroll-mt-8" id="model">
            <Section title="Сведения для модели">
              <ModelBody />
            </Section>
          </div>
          <div className="scroll-mt-8" id="devices">
            <Section action={<RevokeOthers />} title="Активные сеансы">
              <DevicesRows />
            </Section>
          </div>
          <div className="flex scroll-mt-8 flex-col gap-4" id="data">
            <Section title="Данные">
              <ExportRows />
            </Section>
            <Section title="Опасная зона">
              <DangerRows />
            </Section>
          </div>
          {/* Room to scroll the last sections up to the reading line, so the rail can mark them */}
          <div aria-hidden className="h-[55dvh] max-md:hidden" />
        </div>
      </div>
    </SettingsPageFrame>
  );
};
