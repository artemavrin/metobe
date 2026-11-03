"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { FileText, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { BrandLogo } from "@/components/brand-logo";
import type { ComposerHandle } from "@/components/chat/composer";
import { GreetingFigure } from "@/components/chat/greeting-figure";

/** What a new chat greets the user with, read on the server. */
export interface WelcomeData {
  greeting: string;
  /** Today in the user's time zone, a weekday and a date. */
  today: string;
  /** The user has no chat yet: the Hairline picture over the greeting. */
  first: boolean;
  /** The user's mailboxes: their mail tools are on in every chat. */
  mailboxes: string[];
}

/** How many of the user's servers «Начать с» offers. */
const SERVERS = 3;

// Opaque: the night sky behind the screen must not show through the rows' text.
const ROW =
  "bg-background hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))] flex h-11 w-full items-center gap-3 rounded-lg border px-3.5 text-left text-sm transition-[background-color,scale] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none";

/** The line comes out of a soft blur, a moment after the greeting; reduced motion — a fade. */
const LINE_CSS = `
@keyframes line-rise { from { opacity: 0; filter: blur(6px); translate: 0 6px; } }
@keyframes line-fade { from { opacity: 0; } }
.line-rise { animation: line-rise 700ms cubic-bezier(0.23, 1, 0.32, 1) 250ms backwards; }
@media (prefers-reduced-motion: reduce) { .line-rise { animation-name: line-fade; } }
`;

/**
 * The line of the day under the greeting: a short thought about the work, a new one for every new chat. Picked after
 * mount — the server and the browser draw the same first frame — and its line is held from the start, so nothing
 * moves when it comes.
 */
const LineOfDay = () => {
  const t = useTranslations("chat.welcome");
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    const lines = t.raw("phrases") as string[];
    // oxlint-disable-next-line react/set-state-in-effect -- picked in the browser: the server's pick would not match it
    setLine(lines[Math.floor(Math.random() * lines.length)] ?? null);
  }, [t]);
  return (
    <p className="text-foreground/65 mx-auto mt-3 min-h-[1lh] max-w-lg text-[15px] leading-snug text-balance">
      <style>{LINE_CSS}</style>
      {line && <span className="line-rise block">{line}</span>}
    </p>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section>
    <h2 className="text-muted-foreground mb-2 text-xs font-medium">{title}</h2>
    {children}
  </section>
);

/**
 * A new chat's screen over the empty thread (after ReUI's ai-chat-3): the greeting and today, «Начать с» — rows
 * that put something into the question (a server as its badge, the mail as a question its tools answer, a file
 * through the composer's dialog). The last chats are in the sidebar, not here. A user with no chat yet has the
 * Hairline picture over the greeting: everything they connect flows into one place.
 */
export const Welcome = ({
  data,
  servers,
  composer,
}: {
  data: WelcomeData;
  servers: ChatServer[];
  composer: RefObject<ComposerHandle | null>;
}) => {
  const t = useTranslations("chat");
  const { first } = data;
  const offered = servers.filter((s) => s.signIn !== "admin").slice(0, SERVERS);
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col items-center text-center">
          {first && (
            // The picture gives way on a short screen
            <div className="[@media(max-height:600px)]:hidden">
              <GreetingFigure className="-mb-2 w-56 sm:w-64" />
            </div>
          )}
          {/* Today over the greeting, as its eyebrow: small spaced caps, quiet; the greeting stays the big thing */}
          <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-[0.22em] uppercase">
            {data.today}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {data.greeting}
          </h1>
          <LineOfDay />
        </div>
        <Section title={t("welcome.start")}>
          <div className="flex flex-col gap-2">
            {offered.map((s) => (
              <button
                className={ROW}
                key={s.id}
                onClick={() => composer.current?.mention(s)}
                type="button"
              >
                <BrandLogo
                  label={s.title}
                  logo={s.logo ?? undefined}
                  size={20}
                />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {s.signIn === "self" && (
                  <span className="shrink-0 text-xs text-sky-700 dark:text-sky-300">
                    {t("mcp.signIn")}
                  </span>
                )}
              </button>
            ))}
            {data.mailboxes.length > 0 && (
              <button
                className={ROW}
                onClick={() => composer.current?.say(t("welcome.mailAsk"))}
                type="button"
              >
                <Mail className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {t("welcome.mail")}
                </span>
                <span className="text-muted-foreground max-w-[45%] truncate text-xs">
                  {data.mailboxes.join(", ")}
                </span>
              </button>
            )}
            <button
              className={ROW}
              onClick={() => composer.current?.pickFiles()}
              type="button"
            >
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {t("welcome.file")}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {t("welcome.fileHint")}
              </span>
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
};
