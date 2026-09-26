"use client";

// The text field where skills and connections live inline: type `/` or `@`, pick, and the badge sits exactly
// where you typed. A contenteditable with atomic badges (contenteditable=false): Backspace or the badge's × takes
// one out; the value is read back as text and tokens. Plain text only — pastes are stripped, files go to the tray.
import { cn } from "@metobe/ui/lib/utils";
import { GitBranch, HardDrive, Mail, SquareKanban, SquareSlash, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export type Token = { kind: "skill" | "connection"; id: string; label: string };
export type Segment = string | Token;

export type Trigger = { char: "/" | "@"; query: string; rect: DOMRect };

export type EditorHandle = {
  focus: () => void;
  clear: () => void;
  value: () => Segment[];
  insertToken: (t: Token) => void;
  tokens: () => Token[];
  /** Types text at the caret (or at the end), as if the user did — `/` or `@` opens its menu. */
  type: (text: string) => void;
  /** Remembers where the caret was, before a picker takes focus. */
  saveCaret: () => void;
  /** Puts focus and the caret back (or at the end when there was none). */
  restoreCaret: () => void;
};

const CONNECTION_ICON = { drive: HardDrive, github: GitBranch, jira: SquareKanban, mail: Mail } as const;

/** Badge look, shared by the editor (DOM) and the sent message (React), so both read the same. */
export const TOKEN_CLASS = {
  base: "mx-0.5 inline-flex h-[22px] translate-y-[-1px] items-center gap-1 rounded-md px-1.5 align-middle text-[13px] font-medium leading-none select-none [&_svg]:size-3.5",
  // Colour tells the kind at a glance: skills violet, connections sky (only capability icons stay monochrome).
  connection: "bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20 ring-inset dark:text-sky-300",
  skill: "bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 ring-inset dark:text-violet-300",
};

export const TokenIcon = ({ t }: { t: Pick<Token, "kind" | "id"> }) => {
  if (t.kind === "skill") {
    return <SquareSlash />;
  }
  const Icon = CONNECTION_ICON[t.id as keyof typeof CONNECTION_ICON] ?? Mail;
  return <Icon />;
};

/** The badge as a sent message shows it. */
export const TokenBadge = ({ t }: { t: Token }) => (
  <span className={cn(TOKEN_CLASS.base, TOKEN_CLASS[t.kind])}>
    <TokenIcon t={t} />
    {t.label}
  </span>
);

const esc = (s: string) => s.replace(/[&<>"]/gu, (c) => ({ '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

/**
 * Icons for badges built outside React: React draws them once into a hidden template, the badge copies the SVG.
 * (react-dom/server in a client component would pull a second React into the server render.)
 */
const ICON_KEYS = ["skill:any", "connection:github", "connection:mail", "connection:jira", "connection:drive"] as const;
const IconTemplates = ({ refEl }: { refEl: React.RefObject<HTMLDivElement | null> }) => (
  <div hidden ref={refEl}>
    {ICON_KEYS.map((k) => {
      const [kind, id] = k.split(":") as [Token["kind"], string];
      return (
        <span data-icon={k} key={k}>
          <TokenIcon t={{ id, kind }} />
        </span>
      );
    })}
    <span data-icon="remove">
      <X />
    </span>
  </div>
);

const makeBadge = (t: Token, templates: HTMLElement | null) => {
  const icon = templates?.querySelector(`[data-icon="${t.kind === "skill" ? "skill:any" : `connection:${t.id}`}"]`)?.innerHTML ?? "";
  const remove = templates?.querySelector('[data-icon="remove"]')?.innerHTML ?? "×";
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.dataset.kind = t.kind;
  el.dataset.id = t.id;
  el.dataset.label = t.label;
  el.className = cn(TOKEN_CLASS.base, TOKEN_CLASS[t.kind], "token-pop group/token pr-1");
  el.innerHTML = `${icon}<span>${esc(t.label)}</span><button type="button" data-remove aria-label="Убрать ${esc(t.label)}" class="-mr-0.5 flex size-4 items-center justify-center rounded-sm opacity-50 transition-opacity hover:opacity-100 [&_svg]:size-3">${remove}</button>`;
  return el;
};

// One-off pop when a badge lands: rare per message, so it may have a little life; reduced motion drops it.
const EDITOR_CSS = `
@keyframes token-pop { from { scale: 0.9; opacity: 0 } to { scale: 1; opacity: 1 } }
.token-pop { animation: token-pop 160ms cubic-bezier(0.23, 1, 0.32, 1) both }
@media (prefers-reduced-motion: reduce) { .token-pop { animation: none } }
`;

/** A trigger right before the caret: `/` or `@` at the start or after a space, then letters. */
const readTrigger = (root: HTMLElement): (Trigger & { node: Text; start: number; end: number }) | null => {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) {
    return null;
  }
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) {
    return null;
  }
  const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
  const match = /(?:^|\s)([/@])([\p{L}\p{N}-]*)$/u.exec(before);
  if (!match?.[1]) {
    return null;
  }
  const start = sel.anchorOffset - (match[2]?.length ?? 0) - 1;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, sel.anchorOffset);
  return { char: match[1] as "/" | "@", end: sel.anchorOffset, node: node as Text, query: (match[2] ?? "").toLowerCase(), rect: range.getBoundingClientRect(), start };
};

const read = (root: HTMLElement): Segment[] => {
  const out: Segment[] = [];
  const walk = (n: Node) => {
    for (const child of n.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push((child.textContent ?? "").replace(/ /gu, " "));
      } else if (child instanceof HTMLElement && child.dataset.kind) {
        out.push({ id: child.dataset.id as string, kind: child.dataset.kind as Token["kind"], label: child.dataset.label as string });
      } else if (child instanceof HTMLBRElement) {
        out.push("\n");
      } else if (child instanceof HTMLElement) {
        // Chrome wraps new lines in <div>s.
        if (out.length > 0) {
          out.push("\n");
        }
        walk(child);
      }
    }
  };
  walk(root);
  // Merge neighbouring strings, trim the ends.
  const merged: Segment[] = [];
  for (const s of out) {
    const last = merged.at(-1);
    if (typeof s === "string" && typeof last === "string") {
      merged[merged.length - 1] = last + s;
    } else {
      merged.push(s);
    }
  }
  if (typeof merged[0] === "string") {
    merged[0] = merged[0].trimStart();
  }
  const end = merged.length - 1;
  if (typeof merged[end] === "string") {
    merged[end] = (merged[end] as string).trimEnd();
  }
  return merged.filter((s) => s !== "");
};

export const TokenEditor = forwardRef<
  EditorHandle,
  {
    placeholder: string;
    autoFocus?: boolean;
    className?: string;
    onEmptyChange: (empty: boolean) => void;
    onTrigger: (t: Trigger | null) => void;
    /** Returns true when the key was handled (an open menu takes arrows, Enter, Tab, Esc). */
    onKeyDown: (e: React.KeyboardEvent) => boolean;
    onSubmit: () => void;
    onFiles: (files: File[]) => void;
  }
>(({ placeholder, autoFocus, className, onEmptyChange, onTrigger, onKeyDown, onSubmit, onFiles }, ref) => {
  const root = useRef<HTMLDivElement>(null);
  const templates = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const trigger = useRef<ReturnType<typeof readTrigger>>(null);

  const sync = useCallback(() => {
    const el = root.current;
    if (!el) {
      return;
    }
    const empty = !el.querySelector("[data-kind]") && (el.textContent ?? "").trim() === "";
    el.dataset.empty = String(empty);
    if (empty && el.innerHTML !== "") {
      // A stray <br> keeps the placeholder away.
      el.innerHTML = "";
    }
    onEmptyChange(empty);
    trigger.current = readTrigger(el);
    onTrigger(trigger.current);
  }, [onEmptyChange, onTrigger]);

  useEffect(() => {
    if (autoFocus) {
      root.current?.focus();
    }
    if (root.current) {
      root.current.dataset.empty = "true";
    }
  }, [autoFocus]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (root.current) {
        root.current.innerHTML = "";
        sync();
      }
    },
    focus: () => root.current?.focus(),
    insertToken: (t) => {
      const at = trigger.current;
      const el = root.current;
      if (!at || !el) {
        return;
      }
      const range = document.createRange();
      range.setStart(at.node, at.start);
      range.setEnd(at.node, at.end);
      range.deleteContents();
      const space = document.createTextNode(" ");
      range.insertNode(space);
      range.insertNode(makeBadge(t, templates.current));
      const caret = document.createRange();
      caret.setStart(space, 1);
      caret.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(caret);
      el.focus();
      sync();
    },
    restoreCaret: () => {
      const el = root.current;
      if (!el) {
        return;
      }
      el.focus();
      const sel = window.getSelection();
      const range = saved.current && el.contains(saved.current.startContainer) ? saved.current : null;
      const target = range ?? document.createRange();
      if (!range) {
        target.selectNodeContents(el);
        target.collapse(false);
      }
      sel?.removeAllRanges();
      sel?.addRange(target);
    },
    saveCaret: () => {
      // Only a caret that is really in the text; otherwise keep the one saved before (a picker already had focus).
      const sel = window.getSelection();
      if (sel?.rangeCount && root.current?.contains(sel.anchorNode)) {
        saved.current = sel.getRangeAt(0).cloneRange();
      }
    },
    tokens: () => (root.current ? read(root.current).filter((s): s is Token => typeof s !== "string") : []),
    type: (text) => {
      const el = root.current;
      if (!el) {
        return;
      }
      el.focus();
      const sel = window.getSelection();
      if (!sel?.rangeCount || !el.contains(sel.anchorNode)) {
        const end = document.createRange();
        end.selectNodeContents(el);
        end.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(end);
      }
      const before = sel?.anchorNode?.textContent?.slice(0, sel.anchorOffset) ?? "";
      document.execCommand("insertText", false, before && !/\s$/u.test(before) ? ` ${text}` : text);
      sync();
    },
    value: () => (root.current ? read(root.current) : []),
  }));

  return (
    <>
      <style>{EDITOR_CSS}</style>
      <IconTemplates refEl={templates} />
      <div
        aria-label={placeholder}
        aria-multiline
        className={cn(
          "relative w-full overflow-y-auto px-3 pt-3 pb-1 text-base leading-7 whitespace-pre-wrap outline-none md:text-sm md:leading-7",
          "data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:content-[attr(data-placeholder)]",
          className
        )}
        contentEditable
        data-placeholder={placeholder}
        onClick={(e) => {
          const button = (e.target as HTMLElement).closest("[data-remove]");
          const badge = button?.closest<HTMLElement>("[data-kind]");
          if (badge) {
            // The badge shrinks away before it goes; Backspace stays instant.
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const done = () => {
              badge.remove();
              root.current?.focus();
              sync();
            };
            badge
              .animate(reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.9 }], {
                duration: 120,
                easing: "cubic-bezier(0.23, 1, 0.32, 1)",
              })
              .finished.then(done, done);
            return;
          }
          sync();
        }}
        onInput={sync}
        onKeyDown={(e) => {
          if (onKeyDown(e)) {
            return;
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            document.execCommand("insertLineBreak");
          }
        }}
        onKeyUp={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
            sync();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const files = [...e.clipboardData.files];
          if (files.length > 0) {
            onFiles(files);
            return;
          }
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        ref={root}
        role="textbox"
        spellCheck
        suppressContentEditableWarning
        tabIndex={0}
      />
    </>
  );
});
TokenEditor.displayName = "TokenEditor";
