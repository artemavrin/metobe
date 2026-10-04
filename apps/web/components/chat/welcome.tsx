"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { FileText, Mail, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode, RefObject } from "react";

import { BrandLogo } from "@/components/brand-logo";
import type { ComposerHandle } from "@/components/chat/composer";
import { GreetingFigure } from "@/components/chat/greeting-figure";

/** What a new chat greets the user with, read on the server. */
export interface WelcomeData {
  greeting: string;
  /** Today in the user's time zone, a weekday and a date. */
  today: string;
  /** The last chats, latest first, with how long ago their last message was; none — the user's first chat. */
  recent: { id: string; title: string; ago: string }[];
  /** The user's mailboxes: their mail tools are on in every chat. */
  mailboxes: string[];
}

/** How many of the user's servers «Начать с» offers. */
const SERVERS = 3;

const ROW =
  "hover:bg-muted/70 flex h-11 w-full items-center gap-3 rounded-lg border px-3.5 text-left text-sm transition-[background-color,scale] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none";

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
 * through the composer's dialog), and «Продолжить» — the last chats. A user with no chat yet has the Hairline
 * picture over the greeting instead: everything they connect flows into one place.
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
  const first = data.recent.length === 0;
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
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {data.greeting}
          </h1>
          <p className="text-muted-foreground mt-2 first-letter:uppercase">
            {data.today}
          </p>
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
        {!first && (
          <Section title={t("welcome.resume")}>
            <ul className="flex flex-col">
              {data.recent.map((c) => (
                <li key={c.id}>
                  <Link
                    className="text-muted-foreground hover:text-foreground flex items-center gap-2 py-1 text-sm transition-colors duration-150"
                    href={`/chat/${c.id}`}
                  >
                    <MessageSquare className="size-3.5 shrink-0" />
                    <span className="truncate">{c.title}</span>
                    <span className="text-muted-foreground/70 shrink-0 text-xs">
                      {c.ago}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
};
