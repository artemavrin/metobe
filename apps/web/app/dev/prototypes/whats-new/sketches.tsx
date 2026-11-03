"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Link2, Share } from "lucide-react";

// «Рисунок»: not the product but a drawing of the idea — the interface reduced to blocks in the theme's colors, a
// short loop that shows the one move the change is about. Reads at a glance and never goes stale when the screen
// changes; the cost — it is not the real thing, nothing to press. Transform and opacity only; reduced motion keeps
// the drawing still, on its telling frame.

const CSS = `
@keyframes sk-link { 0%, 25% { transform: translate(0, 0) scale(.6); opacity: 0 } 35% { opacity: 1; transform: translate(0,0) scale(1) } 70% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 1 } 80%, 100% { transform: translate(var(--tx), var(--ty)) scale(.6); opacity: 0 } }
@keyframes sk-light { 0%, 68% { opacity: .25 } 78%, 92% { opacity: 1 } 100% { opacity: .25 } }
@keyframes sk-press { 0%, 18% { transform: scale(1) } 22% { transform: scale(.94) } 26%, 100% { transform: scale(1) } }
@keyframes sk-pick { 0%, 30% { transform: translateY(0) } 40%, 100% { transform: translateY(var(--step)) } }
@keyframes sk-rise { 0%, 55% { opacity: 1; transform: translateY(0) } 70%, 100% { opacity: 0; transform: translateY(-14px) } }
@keyframes sk-bubble { 0%, 62% { opacity: 0; transform: translateY(10px) scale(.97) } 74%, 100% { opacity: 1; transform: translateY(0) scale(1) } }
@keyframes sk-scan { 0% { transform: translateY(0) } 45% { transform: translateY(var(--to)) } 100% { transform: translateY(var(--to)) } }
@keyframes sk-card { 0%, 40% { opacity: 0; transform: translateX(-6px) } 50%, 90% { opacity: 1; transform: translateX(0) } 100% { opacity: 0 } }
@keyframes sk-fall { 0% { transform: translate(0, 0); opacity: 0 } 10% { opacity: 1 } 70% { transform: translate(var(--fx), var(--fy)) } 85% { transform: translate(calc(var(--fx) + 18px), calc(var(--fy) - 22px)); opacity: 1 } 100% { transform: translate(calc(var(--fx) + 30px), calc(var(--fy) - 8px)); opacity: 0 } }
.sk { animation-duration: 4.2s; animation-iteration-count: infinite; animation-timing-function: cubic-bezier(0.23, 1, 0.32, 1); animation-fill-mode: both; }
@media (prefers-reduced-motion: reduce) { .sk { animation: none !important; } }
`;

const Bar = ({ className }: { className?: string }) => <span className={cn("bg-foreground/10 block h-2 rounded-full", className)} />;

/** The drawing's canvas: the theme's muted ground with a soft dot grid, the drawing centered. */
const Canvas = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-muted/40 relative grid h-full place-items-center overflow-hidden [background-image:radial-gradient(color-mix(in_oklab,var(--color-foreground)_14%,transparent)_1px,transparent_1px)] [background-size:16px_16px]">
    <style>{CSS}</style>
    <div className="relative">{children}</div>
  </div>
);

const ShareSketch = () => (
  <Canvas>
    <div className="flex items-center gap-16">
      <div className="bg-background ring-foreground/10 flex w-56 flex-col gap-3 rounded-xl p-4 shadow-sm ring-1">
        <div className="flex items-center justify-between">
          <Bar className="w-24" />
          <span className="sk bg-primary text-primary-foreground grid size-6 place-items-center rounded-md [animation-name:sk-press]">
            <Share className="size-3.5" />
          </span>
        </div>
        <Bar className="ml-auto w-28" />
        <Bar className="w-full" />
        <Bar className="w-4/5" />
        <span
          className="sk bg-primary text-primary-foreground absolute top-5 left-48 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium [animation-name:sk-link] [--tx:118px] [--ty:22px]"
        >
          <Link2 className="size-3" /> ссылка
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {["АМ", "ОК", "ДС"].map((n, i) => (
          <span
            className="sk bg-background ring-foreground/15 grid size-10 place-items-center rounded-full text-xs font-medium ring-1 [animation-name:sk-light]"
            key={n}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  </Canvas>
);

const AskSketch = () => (
  <Canvas>
    <div className="flex w-80 flex-col gap-3">
      <span className="sk bg-primary/15 ml-auto block h-8 w-36 rounded-2xl rounded-br-md [animation-name:sk-bubble]" />
      <div className="sk bg-background ring-foreground/10 flex flex-col gap-1 rounded-2xl p-3 shadow-sm ring-1 [animation-name:sk-rise]">
        <Bar className="mb-2 w-40" />
        <div className="relative flex flex-col gap-1">
          <span className="sk bg-muted absolute inset-x-0 top-0 h-8 rounded-lg [--step:36px] [animation-name:sk-pick]" />
          {["w-24", "w-20", "w-28"].map((w, i) => (
            <div className="relative flex h-8 items-center gap-2 px-2" key={w}>
              <span className="bg-foreground/10 grid size-4 place-items-center rounded text-[9px]">{i + 1}</span>
              <Bar className={w} />
            </div>
          ))}
        </div>
      </div>
    </div>
  </Canvas>
);

const MapSketch = () => (
  <Canvas>
    <div className="flex items-center gap-6">
      <div className="relative flex flex-col gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <span className={cn("block h-0.5 rounded-full", i === 4 ? "bg-foreground/70 w-6" : "bg-foreground/25 w-3")} key={i} />
        ))}
        <span className="sk bg-primary absolute -left-3 top-0 size-1.5 -translate-y-0.5 rounded-full [--to:40px] [animation-name:sk-scan]" />
        <div className="sk bg-background ring-foreground/10 absolute top-6 left-10 flex w-48 flex-col gap-2 rounded-xl p-3 shadow-lg ring-1 [animation-name:sk-card]">
          <Bar className="bg-foreground/25 w-32" />
          <Bar className="w-full" />
          <Bar className="w-3/4" />
        </div>
      </div>
      <div className="flex w-64 flex-col gap-3 opacity-60">
        <span className="bg-foreground/10 ml-auto block h-6 w-32 rounded-2xl" />
        <Bar className="w-full" />
        <Bar className="w-5/6" />
        <span className="bg-foreground/10 ml-auto block h-6 w-24 rounded-2xl" />
        <Bar className="w-full" />
        <Bar className="w-2/3" />
      </div>
    </div>
  </Canvas>
);

const WelcomeSketch = () => (
  <Canvas>
    <div className="relative flex w-80 flex-col items-center gap-3">
      {[0, 1, 2].map((i) => (
        <span
          className="sk bg-primary absolute size-1.5 rounded-full shadow-[0_0_8px_2px_var(--color-primary)] [animation-name:sk-fall]"
          key={i}
          style={{ animationDelay: `${i * 1.3}s`, left: `${10 + i * 28}%`, top: -40, ["--fx" as string]: `${30 + i * 6}px`, ["--fy" as string]: "152px" }}
        />
      ))}
      <Bar className="w-20" />
      <span className="bg-foreground/20 block h-4 w-56 rounded-full" />
      <Bar className="w-40" />
      <span className="bg-background ring-foreground/15 mt-10 block h-10 w-full rounded-3xl shadow-sm ring-1" />
    </div>
  </Canvas>
);

export const SKETCHES: Record<string, () => React.ReactNode> = {
  ask: AskSketch,
  map: MapSketch,
  share: ShareSketch,
  welcome: WelcomeSketch,
};
