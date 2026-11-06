"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";
import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { forkChatAction } from "@/app/(app)/(chat)/actions";
import { CompactionCard } from "@/components/chat/compaction";
import {
  AssistantMessage,
  ModelSwitch,
  UserMessage,
} from "@/components/chat/messages";
import { compactionOf } from "@/lib/compaction";
import { threadRows } from "@/lib/thread-rows";

/** How often an open shared chat looks for what its owner wrote since — while the tab is in view. */
const REFRESH_MS = 15_000;

/**
 * A chat someone shared with the team, as a reader sees it: the same thread as the owner's, without anything that
 * writes — no composer, votes, edits, approvals or «connect». Below, who wrote it and «Продолжить у себя»: a copy of
 * the reader's own, where answers come from their models and connections. It reads from the top, and picks up the
 * owner's new messages on its own.
 */
export const SharedChat = ({
  id,
  title,
  owner,
  messages,
  labels,
  servers,
}: {
  id: string;
  title: string;
  /** The owner's name, or their email when they have none. */
  owner: string;
  messages: ChatMessage[];
  /** The models that wrote the answers. */
  labels: ModelLabel[];
  /** The owner's servers: they name the tools in the work. */
  servers: ChatServer[];
}) => {
  const t = useTranslations("chat.share");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  const labelOf = (modelId?: string) => labels.find((l) => l.id === modelId);
  const fork = () =>
    start(async () => {
      setFailed(false);
      const result = await forkChatAction(id);
      if (result.ok) {
        router.push(`/chat/${result.id}`);
      } else {
        setFailed(true);
      }
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 text-sm md:px-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground text-xs">
              {t("author", { name: owner })}
            </p>
          </header>
          {threadRows(messages, "ready").map((row) => {
            if (row.role === "switch") {
              return <ModelSwitch key={row.key} label={labelOf(row.modelId)} />;
            }
            if (row.role === "compaction") {
              const data = compactionOf(row.message);
              return data ? <CompactionCard data={data} key={row.key} /> : null;
            }
            if (row.role === "user") {
              return (
                <UserMessage
                  key={row.key}
                  mentions={servers}
                  message={row.message}
                />
              );
            }
            return (
              <AssistantMessage
                key={row.key}
                label={labelOf(row.message?.metadata?.modelId)}
                live={false}
                message={row.message}
                servers={servers}
              />
            );
          })}
        </div>
      </div>
      <div className="w-full px-4 pb-4 md:px-6">
        <div className="bg-muted/50 mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-muted-foreground flex-1 text-sm text-pretty">
            {failed ? (
              <span className="text-destructive">{t("continueFailed")}</span>
            ) : (
              t("readOnly")
            )}
          </p>
          <Button
            className="shrink-0 transition-transform duration-150 active:scale-[0.97]"
            disabled={pending}
            onClick={fork}
          >
            {pending && <Spinner />}
            {pending ? t("continuing") : t("continue")}
          </Button>
        </div>
      </div>
    </div>
  );
};
