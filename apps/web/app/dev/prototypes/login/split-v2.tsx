"use client";

// «Раскол · 2»: the form on the left, the brand on the right as a floating panel (inset + radius, like the shell's
// sidebar) that can carry a looping video. The panel is always dark, like a photo. On a phone there is no panel —
// just the mark above the form. Language is a quiet row in the form column's footer.
import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, Check, MailX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  CodeInput,
  EmailForm,
  LanguageInline,
  LOGIN_CSS,
  Mark,
  ResendButton,
  useCopy,
  useLoginFlow,
  useCut,
  useDots,
  useMailConfigured,
  usePinnedTagline,
  usePinnedVideo,
} from "./flow";
import { CUTS, cutMask } from "./cuts";
import { TAGLINES } from "./taglines";
import { BRAND_VIDEOS, type BrandVideo } from "./videos";

// Rotation: one clip and one text per visit, each picked at random but never the one shown last time — only one
// file is downloaded, and nothing changes while the person types. The prototype's «Параметры» can pin either.
/** Chosen after hydration so the server and the first client frame agree (both render the empty dark panel). */
const useRotation = (count: number, storageKey: string, pinned: number | null) => {
  const [index, setIndex] = useState<number | null>(null);
  // One pick per page view: StrictMode runs the effect twice, and a second pick could land on last visit's item.
  const picked = useRef<number | null>(null);
  useEffect(() => {
    if (pinned !== null) {
      setIndex(pinned);
      return;
    }
    if (!count) return;
    if (picked.current !== null) {
      setIndex(picked.current);
      return;
    }
    let last = -1;
    try {
      last = Number(localStorage.getItem(storageKey) ?? -1);
    } catch {
      // Storage blocked: a repeat is possible, nothing else changes.
    }
    const pool = Array.from({ length: count }, (_, i) => i).filter((i) => i !== last || count === 1);
    const next = pool[Math.floor(Math.random() * pool.length)] ?? 0;
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // Storage blocked.
    }
    picked.current = next;
    setIndex(next);
  }, [count, storageKey, pinned]);
  return index;
};

const useBrandVideo = (): BrandVideo | null => {
  const index = useRotation(BRAND_VIDEOS.length, "login-brand-video", usePinnedVideo());
  return index === null ? null : (BRAND_VIDEOS[index] ?? null);
};

const useBrandTagline = () => {
  const index = useRotation(TAGLINES.length, "login-brand-tagline", usePinnedTagline());
  return index === null ? null : (TAGLINES[index] ?? null);
};


const PANEL_CSS = `
@keyframes login-drift { 0%, 100% { transform: translate(0, 0) scale(1) } 50% { transform: translate(-6%, -4%) scale(1.08) } }
.login-drift { animation: login-drift 18s ease-in-out infinite; }
.login-media { transition: opacity 400ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .login-media { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .login-drift { animation: none; } }
`;

/** Video only on wide screens and without reduced motion; otherwise the poster (or the placeholder) stands still. */
const usePlayVideo = () => {
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPlay(wide.matches && !calm.matches);
    update();
    wide.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      calm.removeEventListener("change", update);
    };
  }, []);
  return play;
};

// Panel size riffs: «wide» — half the screen, full height; «narrow» — full height, ~38% and at most 560px;
// «frame» — exactly 4:5 like the clip (nothing cropped), centred in the right part with air around it;
// «slant» — edge to edge with a shaped left edge (cuts.ts, switched in the picker's «Параметры»).
type PanelSize = "wide" | "narrow" | "frame" | "slant";
const PANEL_SIZE: Record<PanelSize, string> = {
  frame: "rounded-2xl aspect-[4/5] h-[min(calc(100dvh-96px),640px)] lg:p-8",
  narrow: "rounded-2xl m-2 lg:w-[38%] lg:max-w-[560px] lg:p-10",
  slant: "lg:w-[46%] lg:max-w-[720px] lg:p-10",
  wide: "rounded-2xl m-2 lg:w-[48%] lg:p-10",
};

const BrandPanel = ({ size }: { size: PanelSize }) => {
  const t = useCopy();
  const play = usePlayVideo();
  const video = useBrandVideo();
  const cut = useCut();
  const dots = useDots();
  const copy = useBrandTagline();
  const tagline = copy && (t.title.startsWith("Sign") ? copy.en : copy.ru);
  return (
    <aside
      className={cn(
        "relative isolate hidden shrink-0 overflow-hidden bg-[#0e0f14] text-white lg:flex lg:flex-col lg:justify-end",
        PANEL_SIZE[size]
      )}
      style={size === "slant" ? { ...cutMask(cut), containerType: "inline-size" } : undefined}
    >
      <style>{PANEL_CSS}</style>
      {video &&
        (play ? (
          <video
            autoPlay
            className="login-media absolute inset-0 -z-20 size-full object-cover"
            loop
            muted
            playsInline
            poster={video.poster}
            src={video.src}
          />
        ) : (
          // oxlint-disable-next-line nextjs/no-img-element -- prototype poster, no optimisation needed
          <img alt="" className="login-media absolute inset-0 -z-20 size-full object-cover" src={video.poster} />
        ))}
      {!BRAND_VIDEOS.length && (
        // Placeholder until the video exists: a light, daytime frame with brand-blue light, close to the new prompts,
        // so the panel's edge reads the way it will over a real clip.
        <div aria-hidden className="absolute inset-0 -z-20 bg-[linear-gradient(160deg,#ece6dc_0%,#cfc8bd_45%,#7f879c_100%)]">
          <div className="login-drift absolute -top-1/4 -right-1/4 size-[75%] rounded-full bg-[#193cb8] opacity-45 blur-[110px]" />
          <div className="login-drift absolute top-1/3 left-[10%] size-[45%] rounded-full bg-[#fff4e0] opacity-70 blur-[90px] [animation-delay:-9s]" />
        </div>
      )}
      {/* Keeps the tagline readable over any frame: eased stops, so the fade has no visible band on light clips */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[linear-gradient(to_top,rgb(0_0_0/0.92)_0%,rgb(0_0_0/0.78)_22%,rgb(0_0_0/0.5)_46%,rgb(0_0_0/0.2)_70%,transparent_100%)]"
      />
      {/* The dot grid from round one: rising out of the shade under the tagline, or a fine veil over everything */}
      {dots !== "none" && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.2)_0.8px,transparent_1px)] [background-size:18px_18px]",
            dots === "bottom" ? "[mask-image:linear-gradient(to_top,black_0%,black_12%,transparent_45%)]" : "opacity-50"
          )}
        />
      )}
      {/* On a cut panel the tagline starts where the edge meets the bottom (cqw = % of the panel, not the page) */}
      <div
        className="login-media max-w-md"
        key={tagline?.title}
        style={size === "slant" ? { paddingLeft: `calc(${CUTS[cut].bottom}cqw + 16px)`, boxSizing: "content-box" } : undefined}
      >
        {tagline && (
          <>
            <h2 className="text-3xl leading-[1.15] font-semibold tracking-tight text-balance">{tagline.title}</h2>
            <p className="mt-3 text-base leading-relaxed text-pretty text-white/75">{tagline.text}</p>
          </>
        )}
      </div>
    </aside>
  );
};

const FormColumn = () => {
  const flow = useLoginFlow();
  const t = useCopy();
  const mail = useMailConfigured();

  return (
    <div className="flex min-h-dvh flex-1 flex-col px-5 sm:px-8 lg:min-h-0 lg:px-12">
      <header className="flex h-16 items-center lg:h-20">
        <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <Mark className="size-7 rounded-lg text-xs" />
          Metobe
        </span>
      </header>

      <main className="flex flex-1 items-start pt-[8vh] lg:items-center lg:pt-0">
        <div className="mx-auto w-full max-w-sm">
          {!mail ? (
            <div className="login-in" key="nomail">
              <span className="bg-muted mb-6 inline-flex size-10 items-center justify-center rounded-xl border">
                <MailX className="text-muted-foreground size-5" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
              <p className="text-muted-foreground mt-2 leading-relaxed">{t.mailNotConfigured}</p>
            </div>
          ) : flow.step === "email" ? (
            <div className={flow.email ? "login-in-back" : "login-in"} key="email">
              <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
              <p className="text-muted-foreground mt-2 mb-8">{t.description}</p>
              <EmailForm flow={flow} size="lg" />
            </div>
          ) : flow.step === "code" ? (
            <div className="login-in-x" key="code">
              <h1 className="text-2xl font-semibold tracking-tight">{t.code}</h1>
              <p className="text-muted-foreground mt-2 mb-8">
                {t.sentTo} <span className="text-foreground font-medium break-all">{flow.email}</span>
              </p>
              <CodeInput flow={flow} slotClassName="size-12 text-lg" />
              <p className="text-muted-foreground mt-6 text-sm">{t.orLink}</p>
              <div className="mt-8 flex items-center justify-between gap-3 border-t pt-4 text-sm">
                <Button className="text-muted-foreground -ml-2 h-7 gap-1.5 px-2 font-normal" onClick={flow.back} size="sm" variant="ghost">
                  <ArrowLeft />
                  {t.back}
                </Button>
                <ResendButton flow={flow} />
              </div>
            </div>
          ) : (
            <div className="login-pop" key="done">
              <span className="bg-success/15 text-success mb-6 inline-flex size-10 items-center justify-center rounded-xl">
                <Check className="size-5" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">{t.done}</h1>
              <p className="text-muted-foreground mt-2">{t.doneHint}</p>
              <Button className="text-muted-foreground -ml-2 mt-6 font-normal" onClick={flow.reset} size="sm" variant="ghost">
                ↺ ещё раз (прототип)
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Bottom padding clears the prototype picker; in the product it is the usual 24px */}
      <footer className="flex h-16 items-center pb-20 lg:pb-0">
        <LanguageInline className="-ml-1" />
      </footer>
    </div>
  );
};

// «frame» keeps the whole composition in a centred 1200px container, so form and frame don't drift apart on wide screens.
const SplitLayout = ({ panel }: { panel: PanelSize }) => (
  <div className={cn("bg-background flex min-h-dvh lg:h-dvh", panel === "frame" && "mx-auto max-w-[1200px]")}>
    <style>{LOGIN_CSS}</style>
    <FormColumn />
    {panel === "frame" ? (
      <div className="hidden items-center justify-center pr-6 pl-2 lg:flex xl:pr-10">
        <BrandPanel size="frame" />
      </div>
    ) : (
      <BrandPanel size={panel} />
    )}
  </div>
);

export const SplitV2 = () => <SplitLayout panel="wide" />;
export const SplitNarrow = () => <SplitLayout panel="narrow" />;
export const SplitFrame = () => <SplitLayout panel="frame" />;
export const SplitSlant = () => <SplitLayout panel="slant" />;
