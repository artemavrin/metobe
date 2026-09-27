"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import { connectServer } from "@/app/(app)/(chat)/actions";
import { ConnectDialog } from "@/components/chat/connect-dialog";
import { MentionMenu } from "@/components/chat/mention-menu";
import { ModelChooser } from "@/components/chat/picker/chooser";
import type { Favorites, PickerModel } from "@/components/chat/picker/data";
import type { NavSource } from "@/components/chat/picker/motion";
import { TokenEditor } from "@/components/chat/token-editor";
import type { EditorHandle, Trigger } from "@/components/chat/token-editor";
import {
  OAuthWindowDialog,
  useOAuthWindow,
} from "@/components/mcp/oauth-window";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type SendState = "send" | "stop";

const SEND_ICON: Record<SendState, React.ReactNode> = {
  send: (
    <svg
      aria-hidden
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  stop: <span className="size-3 rounded-[3px] bg-current" />,
};

/** The arrow flies out through the top when a message goes; the stop square settles in, and back. */
const SendButton = ({
  state,
  ready,
  onStop,
}: {
  state: SendState;
  ready: boolean;
  onStop: () => void;
}) => {
  const t = useTranslations("chat");
  // Where the morph comes from: send → stop sends the arrow up; stop → send brings it up from below.
  const [shown, setShown] = useState(state);
  const [from, setFrom] = useState(state);
  if (shown !== state) {
    setFrom(shown);
    setShown(state);
  }
  const dim = state === "send" && !ready;
  return (
    <Button
      aria-disabled={dim}
      aria-label={t(state)}
      className={cn(
        "relative size-9 overflow-hidden rounded-xl active:translate-y-0 active:scale-[0.97]",
        "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),opacity_150ms_ease]",
        dim && "opacity-40"
      )}
      onClick={(e) => {
        if (state === "stop") {
          e.preventDefault();
          onStop();
        }
      }}
      size="icon"
      title={t(state)}
      type={state === "stop" ? "button" : "submit"}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{
            filter: "blur(0px)",
            opacity: 1,
            transform: "translateY(0%) scale(1)",
          }}
          className="flex items-center justify-center"
          exit={
            state === "stop"
              ? {
                  opacity: 0,
                  transform: "translateY(-100%) scale(1)",
                  transition: { duration: 0.15, ease: EASE_OUT },
                }
              : {
                  filter: "blur(2px)",
                  opacity: 0,
                  transform: "translateY(0%) scale(0.9)",
                  transition: { duration: 0.15, ease: EASE_OUT },
                }
          }
          initial={
            state === "send" && from === "stop"
              ? { opacity: 0, transform: "translateY(100%) scale(1)" }
              : {
                  filter: "blur(2px)",
                  opacity: 0,
                  transform: "translateY(0%) scale(0.9)",
                }
          }
          key={state}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {SEND_ICON[state]}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
};

/**
 * The composer «Щелчок» (P2): a grey shell with the white card nested in it — the band on top of the card (files,
 * the context) arrives with attachments. Enter sends, Shift+Enter breaks the line, Esc stops an answer. `@` mentions
 * an MCP server right in the text: only mentioned servers give their tools to the model; one the user has not
 * connected yet is connected from here — its OAuth page, or their token in a small dialog.
 */
export const Composer = ({
  home,
  model,
  favorites,
  onModel,
  busy,
  onSend,
  onStop,
  servers,
  onServerReady,
}: {
  /** An empty chat: the composer sits in the middle, a bit taller. */
  home: boolean;
  /** The model the next message goes to, and the user's favorites to pick another from. */
  model: PickerModel;
  favorites: Favorites;
  onModel: (m: PickerModel) => void;
  /** An answer is on its way: the button stops it instead of sending. */
  busy: boolean;
  /** The text (a mention reads `@Name`) and the servers mentioned in it. */
  onSend: (text: string, catalogIds: string[]) => void;
  onStop: () => void;
  /** The MCP servers the user may mention here. */
  servers: ChatServer[];
  /** A server the user just connected from the chat. */
  onServerReady: (id: string) => void;
}) => {
  const t = useTranslations("chat");
  const editor = useRef<EditorHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const nav = useRef<NavSource>("snap");
  const [ready, setReady] = useState(false);
  const [trigger, setTrigger] = useState<{
    at: Trigger;
    box: DOMRect;
    taken: Set<string>;
  } | null>(null);
  const [active, setActive] = useState(0);
  const [connecting, setConnecting] = useState<ChatServer | null>(null);
  const items = trigger
    ? servers.filter(
        (s) =>
          !trigger.taken.has(s.id) &&
          s.title.toLowerCase().includes(trigger.at.query)
      )
    : [];

  const onTrigger = useCallback((at: Trigger | null) => {
    nav.current = "snap";
    setActive(0);
    const rect = box.current?.getBoundingClientRect();
    setTrigger(
      at && rect
        ? {
            at,
            box: rect,
            taken: new Set(editor.current?.tokens().map((x) => x.id)),
          }
        : null
    );
  }, []);
  const onEmptyChange = useCallback((empty: boolean) => setReady(!empty), []);

  const insert = (server: ChatServer) => {
    editor.current?.insertToken({
      id: server.id,
      label: server.title,
      logo: server.logo ?? undefined,
    });
    setTrigger(null);
  };
  // OAuth signs in in the provider's window: the draft stays where it is, the badge lands where `@` was typed.
  const [signingIn, setSigningIn] = useState<ChatServer | null>(null);
  const oauth = useOAuthWindow({
    onDone: (id) => {
      if (signingIn?.id === id) {
        onServerReady(id);
        insert(signingIn);
      }
    },
  });
  /** A server the user has not connected: OAuth — in its window, from this very pick; anything else asks here. */
  const pick = (server: ChatServer) => {
    if (server.signIn === "ready") {
      insert(server);
      return;
    }
    if (server.auth !== "oauth") {
      setConnecting(server);
      return;
    }
    setSigningIn(server);
    oauth.start(server, (returnTo) =>
      connectServer({ catalogId: server.id, returnTo })
    );
  };

  const submit = () => {
    const segments = editor.current?.value() ?? [];
    const text = segments
      .map((x) => (typeof x === "string" ? x : `@${x.label}`))
      .join("")
      .trim();
    if (!text || busy) {
      return;
    }
    onSend(
      text,
      segments.flatMap((x) => (typeof x === "string" ? [] : [x.id]))
    );
    editor.current?.clear();
  };

  return (
    <>
      <form
        data-composer
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* The shell: grey, the white card nested inside — radius 22 = 18 + 4 of padding */}
        <div
          className="bg-muted/70 dark:bg-muted/40 ring-border/70 relative rounded-[22px] p-1 ring-1"
          ref={box}
        >
          {trigger && (
            <MentionMenu
              active={active}
              box={trigger.box}
              items={items}
              nav={nav}
              onHover={setActive}
              onPick={pick}
              trigger={trigger.at}
            />
          )}
          <div
            className={cn(
              "bg-background border-border/80 flex flex-col rounded-[18px] border shadow-xs",
              "focus-within:border-foreground/15 [transition:border-color_200ms_ease,box-shadow_200ms_ease]",
              "focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_0_rgba(0,0,0,0.04)] dark:focus-within:shadow-xs"
            )}
          >
            <TokenEditor
              autoFocus
              className={cn("max-h-60", home ? "min-h-24" : "min-h-16")}
              onEmptyChange={onEmptyChange}
              onKeyDown={(e) => {
                if (trigger) {
                  if (
                    items.length > 0 &&
                    (e.key === "ArrowDown" || e.key === "ArrowUp")
                  ) {
                    e.preventDefault();
                    nav.current = e.repeat ? "snap" : "step";
                    setActive(
                      (a) =>
                        (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) %
                        items.length
                    );
                    return true;
                  }
                  const current = items[active];
                  if (current && (e.key === "Enter" || e.key === "Tab")) {
                    e.preventDefault();
                    if (current.signIn !== "admin") {
                      pick(current);
                    }
                    return true;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setTrigger(null);
                    return true;
                  }
                }
                if (e.key === "Escape" && busy) {
                  e.preventDefault();
                  onStop();
                  return true;
                }
                return false;
              }}
              onSubmit={submit}
              onTrigger={onTrigger}
              placeholder={t("placeholder")}
              ref={editor}
              removeLabel={t("mcp.remove")}
            />
            <div className="flex items-center gap-1 px-2 pt-1 pb-2">
              <ModelChooser
                favorites={favorites}
                model={model}
                onChange={onModel}
                onDone={() => editor.current?.focus()}
              />
              <span className="ml-auto">
                <SendButton
                  onStop={onStop}
                  ready={ready}
                  state={busy ? "stop" : "send"}
                />
              </span>
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-xs">
          {t("disclaimer")} <span className="opacity-50">·</span> <Kbd>⌘/</Kbd>{" "}
          {t("allModels")}
        </p>
      </form>
      {/* Outside the form: React events bubble through portals, and its submit would send the draft */}
      <ConnectDialog
        onClose={() => setConnecting(null)}
        onConnect={async (secret, username) => {
          const server = connecting;
          if (!server) {
            return false;
          }
          const result = await connectServer({
            catalogId: server.id,
            returnTo: window.location.pathname,
            secret,
            username,
          });
          if (result.state !== "ok") {
            return false;
          }
          setConnecting(null);
          onServerReady(server.id);
          insert(server);
          return true;
        }}
        server={connecting}
      />
      <OAuthWindowDialog flow={oauth} />
    </>
  );
};
