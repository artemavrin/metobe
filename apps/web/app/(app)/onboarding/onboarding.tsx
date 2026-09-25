"use client";

import type { SourceKind } from "@metobe/contracts/models";
import type { SourceDetail } from "@metobe/core/sources-read";
import { Button } from "@metobe/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@metobe/ui/components/reui/frame";
import { Separator } from "@metobe/ui/components/separator";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConnectForm, KindList } from "../settings/sources/connect-dialog";
import { Celebrate } from "./celebrate";
import { ModelsStep } from "./models-step";

// Card «Колода» (P7, riff «Тихая»): the steps still ahead peek out behind the card, the deck thins as you go.
// Above the content — the way back, «Шаг 2 · Ключ» and progress dots, with a faint rule under them.

export type OnboardingStep =
  | { id: "pick"; connected: SourceKind[] }
  | {
      id: "models";
      source: Pick<
        SourceDetail["source"],
        "id" | "kind" | "title" | "logo" | "baseUrl"
      >;
      models: SourceDetail["models"];
    }
  | { id: "done"; names: string[] };

const STEPS = ["pick", "key", "models"] as const;

// The card surface without Frame's translucency, so the cards behind never show through.
const SURFACE = "bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]";

const PEEK = 12;

export const Onboarding = ({ step }: { step: OnboardingStep }) => {
  const t = useTranslations("onboarding");
  const ts = useTranslations("sources");
  const router = useRouter();
  // Picking and the key are one page: the key step is the kind picked here.
  const [kind, setKind] = useState<SourceKind | null>(null);
  const current = step.id === "pick" && kind ? "key" : step.id;
  const finished = current === "done";
  const n = finished ? STEPS.length + 1 : STEPS.indexOf(current) + 1;
  const ahead = Math.max(0, STEPS.length - n);

  let back: (() => void) | null = null;
  if (current === "key") {
    back = () => setKind(null);
  } else if (current === "models") {
    back = () => router.push("/onboarding");
  }

  let header: { title: string; description: string } | null = null;
  let body: React.ReactNode = null;
  if (step.id === "done") {
    body = <Celebrate names={step.names} />;
  } else if (step.id === "models") {
    body = <ModelsStep models={step.models} source={step.source} />;
  } else if (kind) {
    const title = ts(`kinds.${kind}.title`);
    header = {
      description: t("key.text", { blurb: ts(`kinds.${kind}.blurb`) }),
      title: t("key.title", { title }),
    };
    body = (
      <ConnectForm
        key={kind}
        kind={kind}
        layout="page"
        onDone={(id) => router.push(`/onboarding?source=${id}`)}
      />
    );
  } else {
    const more = step.connected.length > 0;
    header = more
      ? { description: t("pick.moreText"), title: t("pick.moreTitle") }
      : { description: t("pick.text"), title: t("pick.title") };
    body = <KindList connected={step.connected} onPick={setKind} />;
  }

  return (
    <main className="bg-muted/40 flex min-h-dvh flex-col items-center px-4 pt-[10vh] pb-24 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>
      <div className="relative isolate h-fit w-full max-w-xl">
        {Array.from({ length: ahead }, (_, i) => (
          <div
            aria-hidden
            className={cn(
              SURFACE,
              "absolute inset-x-0 top-0 h-full origin-bottom rounded-xl border shadow-xs transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
            )}
            key={STEPS[n + i]}
            style={{
              opacity: 1 - (i + 1) * 0.2,
              transform: `translateY(${(i + 1) * PEEK}px) scale(${1 - (i + 1) * 0.05})`,
              zIndex: -1 - i,
            }}
          />
        ))}

        <Frame
          className={cn(
            SURFACE,
            "animate-in fade-in slide-in-from-bottom-3 zoom-in-[0.98] fill-mode-both relative shadow-lg duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none"
          )}
          key={current}
          spacing="lg"
          stacked
        >
          <div className="box-content flex h-6 items-center justify-between px-(--frame-panel-header-px) pt-3 pb-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              {back && (
                <Button
                  aria-label={t("back")}
                  className="-ml-1.5"
                  onClick={back}
                  size="icon-xs"
                  variant="ghost"
                >
                  <ArrowLeft />
                </Button>
              )}
              {finished
                ? t("finished")
                : t("stepOf", { n, title: t(`steps.${current}`) })}
            </span>
            <span className="sr-only">
              {t("progress", {
                n: Math.min(n, STEPS.length),
                total: STEPS.length,
              })}
            </span>
            <span aria-hidden className="flex items-center gap-1.5">
              {STEPS.map((s, i) => {
                let dot = "bg-border w-1.5";
                if (finished) {
                  dot = "bg-primary w-1.5";
                } else if (n === i + 1) {
                  dot = "bg-primary w-5";
                } else if (n > i + 1) {
                  dot = "bg-primary/40 w-1.5";
                }
                return (
                  <span
                    className={cn(
                      "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
                      dot
                    )}
                    key={s}
                  />
                );
              })}
            </span>
          </div>
          <Separator className="opacity-60" />
          {header ? (
            <>
              <FrameHeader className="gap-1 pt-4!">
                <FrameTitle className="text-xl">{header.title}</FrameTitle>
                <FrameDescription>{header.description}</FrameDescription>
              </FrameHeader>
              <FramePanel>{body}</FramePanel>
            </>
          ) : (
            body
          )}
        </Frame>
      </div>
      {!finished && (
        <Link
          className="text-muted-foreground hover:text-foreground mt-10 text-xs transition-colors"
          href="/settings"
        >
          {t("settings")}
        </Link>
      )}
    </main>
  );
};
