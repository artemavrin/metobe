"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { connectServer } from "@/app/(app)/(chat)/actions";
import { AddMenu } from "@/components/chat/add-menu";
import { useChatPrefs } from "@/components/chat/chat-shell";
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

/** The gaps between «+», the field and the buttons, and the field's own side padding: what a line has less than the row. */
const GAP = 4;
const FIELD_PADDING = 16;
/** The height clip's padding above and below (`p-1.5`), around the content it follows. */
const FRAME_PADDING = 12;

/**
 * Whether a draft sits on one line in `room` px: no line break, and its width as one unbroken line fits. Measured on
 * a hidden copy — the field itself is as wide as the layout it is in, which is what this decides.
 */
const fitsOneLine = (field: HTMLElement, room: number) => {
  const text = field.textContent ?? "";
  // A line break, but not the one that waits at the end after the caret (the editor's own, never sent).
  if (text.replace(/\n$/u, "").includes("\n")) {
    return false;
  }
  // Far more than any row holds: nothing to measure.
  if (text.length > 400) {
    return false;
  }
  const probe = field.cloneNode(true) as HTMLElement;
  for (const name of ["contenteditable", "role", "tabindex", "aria-label"]) {
    probe.removeAttribute(name);
  }
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;left:0;top:0;visibility:hidden;width:max-content;max-width:none;min-height:0;max-height:none;padding:0;white-space:pre;overflow:visible";
  field.parentElement?.append(probe);
  const width = probe.scrollWidth;
  probe.remove();
  return width <= room;
};

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
        "relative size-9 overflow-hidden rounded-full active:translate-y-0 active:scale-[0.97]",
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
 * The composer: one pill (kobra's chat input) — a single line while the draft fits beside the model and the send
 * button; longer, the text takes the whole width and the buttons a row below it. Enter sends, Shift+Enter breaks the
 * line, Esc stops an answer. `@` mentions an MCP server right in the text: only mentioned servers give their tools
 * to the model; one the user has not connected yet is connected from here — its OAuth page, or their token in a
 * small dialog.
 */
export const Composer = ({
  model,
  favorites,
  onModel,
  busy,
  onSend,
  onStop,
  servers,
  onServerReady,
}: {
  /** The model the next message goes to, and the user's favorites to pick another from. */
  model: PickerModel;
  favorites: Favorites;
  onModel: (m: PickerModel) => void;
  /** An answer is on its way: the button stops it instead of sending. */
  busy: boolean;
  /** The text; a mention reads `@Name` — the servers a question names give the model their tools. */
  onSend: (text: string) => void;
  onStop: () => void;
  /** The MCP servers the user may mention here. */
  servers: ChatServer[];
  /** A server the user just connected from the chat. */
  onServerReady: (id: string) => void;
}) => {
  const t = useTranslations("chat");
  const { sendKey } = useChatPrefs();
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

  // One line while the draft fits beside the buttons; past that — or at a line break — the text above them.
  const frame = useRef<HTMLDivElement>(null);
  const deck = useRef<HTMLDivElement>(null);
  const plus = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement | null>(null);
  const [tall, setTall] = useState(false);
  const measure = useCallback(() => {
    const at = field.current;
    const row = deck.current;
    const buttons = actions.current;
    const add = plus.current;
    if (!at || !row || !buttons || !add) {
      return;
    }
    const room =
      row.clientWidth -
      add.offsetWidth -
      buttons.offsetWidth -
      2 * GAP -
      FIELD_PADDING;
    // A little less room to come back to one line, so a draft right at the edge does not flip back and forth.
    setTall((was) => !fitsOneLine(at, was ? room - 8 : room));
  }, []);
  const onDraft = useCallback(
    (el: HTMLDivElement) => {
      field.current = el;
      measure();
    },
    [measure]
  );
  // The pill's height follows its content at once while typing, over 200ms when the layout switches (data-morph).
  useEffect(() => {
    const row = deck.current;
    const shell = frame.current;
    if (!row || !shell) {
      return;
    }
    const observer = new ResizeObserver(() => {
      shell.style.height = `${row.offsetHeight + FRAME_PADDING}px`;
      measure();
    });
    observer.observe(row);
    if (actions.current) {
      observer.observe(actions.current);
    }
    return () => observer.disconnect();
  }, [measure]);
  const shown = useRef(tall);
  useLayoutEffect(() => {
    const shell = frame.current;
    if (!shell || shown.current === tall) {
      return;
    }
    shown.current = tall;
    shell.dataset.morph = "";
    const timer = setTimeout(() => {
      delete shell.dataset.morph;
    }, 260);
    return () => clearTimeout(timer);
  }, [tall]);

  // Where a picked server's badge goes: in place of the `@…` typed, or — picked from «+» — where the caret was.
  const place = useRef<"mention" | "add">("mention");
  const insert = (server: ChatServer) => {
    const token = {
      id: server.id,
      label: server.title,
      logo: server.logo ?? undefined,
    };
    if (place.current === "add") {
      editor.current?.addToken(token);
    } else {
      editor.current?.insertToken(token);
    }
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
    onSend(text);
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
        {/* One pill; radius 24 = half its one-line height (36 + 2 × 6 of padding) */}
        <div
          className={cn(
            "bg-muted/70 dark:bg-muted/40 border-border/70 relative rounded-[24px] border p-1.5",
            "focus-within:border-foreground/15 [transition:border-color_200ms_ease]"
          )}
          ref={box}
        >
          {trigger && (
            <MentionMenu
              active={active}
              box={trigger.box}
              items={items}
              nav={nav}
              onHover={setActive}
              onPick={(server) => {
                place.current = "mention";
                pick(server);
              }}
              trigger={trigger.at}
            />
          )}
          {/* The height clip, with room around for the buttons' focus rings */}
          <div
            className="-m-1.5 overflow-hidden p-1.5 transition-[height] duration-0 ease-[cubic-bezier(0.23,1,0.32,1)] data-morph:duration-200 motion-reduce:transition-none"
            ref={frame}
          >
            <div
              className="group/deck grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-1 data-tall:gap-y-1"
              data-tall={tall || undefined}
              ref={deck}
            >
              <div
                className="col-start-1 row-start-1 group-data-tall/deck:row-start-2"
                ref={plus}
              >
                <AddMenu
                  field={() =>
                    deck.current?.querySelector<HTMLElement>(
                      "[role=textbox]"
                    ) ?? null
                  }
                  mentioned={() =>
                    new Set(editor.current?.tokens().map((x) => x.id))
                  }
                  onPick={(server) => {
                    place.current = "add";
                    pick(server);
                  }}
                  servers={servers}
                />
              </div>
              <TokenEditor
                autoFocus
                className="col-start-2 row-start-1 max-h-60 min-h-9 px-2 py-1.5 leading-6 group-data-tall/deck:col-span-3 group-data-tall/deck:col-start-1 md:leading-6"
                modEnterSends={sendKey === "mod-enter"}
                onChange={onDraft}
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
                        place.current = "mention";
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
              <div
                className="col-start-3 row-start-1 flex items-center gap-1 group-data-tall/deck:row-start-2"
                ref={actions}
              >
                <ModelChooser
                  favorites={favorites}
                  model={model}
                  onChange={onModel}
                  onDone={() => editor.current?.focus()}
                />
                <SendButton
                  onStop={onStop}
                  ready={ready}
                  state={busy ? "stop" : "send"}
                />
              </div>
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
            return "error";
          }
          const result = await connectServer({
            catalogId: server.id,
            returnTo: window.location.pathname,
            secret,
            username,
          });
          if (result.state !== "ok") {
            return result.state === "refused" ? "refused" : "error";
          }
          setConnecting(null);
          onServerReady(server.id);
          insert(server);
          return "ok";
        }}
        server={connecting}
      />
      <OAuthWindowDialog flow={oauth} />
    </>
  );
};
