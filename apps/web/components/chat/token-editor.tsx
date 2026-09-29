"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Plug, X } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";

// The composer's text field (P2 «Щелчок»): type `@`, pick a server, and its badge sits exactly where you typed. A
// contenteditable with atomic badges (contenteditable=false): Backspace or the badge's × takes one out; the value
// is read back as text and tokens. Plain text only — pastes are stripped.

/** An MCP server mentioned in the text. */
export interface Token {
  id: string;
  label: string;
  logo?: string;
}
export type Segment = string | Token;

/** `@` and what follows it right before the caret, and where it sits (the menu opens there). */
export interface Trigger {
  query: string;
  rect: DOMRect;
}

export interface EditorHandle {
  focus: () => void;
  clear: () => void;
  value: () => Segment[];
  tokens: () => Token[];
  /** Puts a badge where the `@…` being typed is. */
  insertToken: (t: Token) => void;
  /** Puts a badge where the caret is, or was last in the field — else at its end (a pick from the «+» menu). */
  addToken: (t: Token) => void;
}

/** The badge's look, shared by the editor (built in the DOM) and a sent message (React). */
export const TOKEN_CLASS =
  "mx-0.5 inline-flex h-[22px] translate-y-[-1px] items-center gap-1 rounded-md px-1.5 align-middle text-[13px] font-medium leading-none select-none bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20 ring-inset dark:text-sky-300 [&_svg]:size-3.5";

/** The badge as a sent message shows it. */
export const TokenBadge = ({
  label,
  logo,
}: {
  label: string;
  logo?: string;
}) => (
  <span className={TOKEN_CLASS}>
    {logo ? (
      // oxlint-disable-next-line nextjs/no-img-element -- a tiny data URL picture; next/image adds nothing here
      <img alt="" className="size-3.5 rounded-[3px]" src={logo} />
    ) : (
      <Plug />
    )}
    {label}
  </span>
);

const esc = (s: string) =>
  s.replaceAll(
    /[&<>"]/gu,
    (c) => ({ '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c
  );

/** Icons for badges built outside React: drawn once into a hidden template, the badge copies the SVG. */
const IconTemplates = ({
  refEl,
}: {
  refEl: React.RefObject<HTMLDivElement | null>;
}) => (
  <div hidden ref={refEl}>
    <span data-icon="plug">
      <Plug />
    </span>
    <span data-icon="remove">
      <X />
    </span>
  </div>
);

const makeBadge = (
  t: Token,
  templates: HTMLElement | null,
  removeLabel: string
) => {
  const plug = templates?.querySelector('[data-icon="plug"]')?.innerHTML ?? "";
  const remove =
    templates?.querySelector('[data-icon="remove"]')?.innerHTML ?? "×";
  const icon = t.logo
    ? `<img alt="" class="size-3.5 rounded-[3px]" src="${esc(t.logo)}">`
    : plug;
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.dataset.token = "";
  el.dataset.id = t.id;
  el.dataset.label = t.label;
  if (t.logo) {
    el.dataset.logo = t.logo;
  }
  el.className = cn(TOKEN_CLASS, "token-pop pr-1");
  el.innerHTML = `${icon}<span>${esc(t.label)}</span><button type="button" data-remove aria-label="${esc(`${removeLabel} ${t.label}`)}" class="-mr-0.5 flex size-4 items-center justify-center rounded-sm opacity-50 transition-opacity hover:opacity-100 [&_svg]:size-3">${remove}</button>`;
  return el;
};

// One-off pop when a badge lands: rare per message, so it may have a little life; reduced motion drops it.
const EDITOR_CSS = `
@keyframes token-pop { from { scale: 0.9; opacity: 0 } to { scale: 1; opacity: 1 } }
.token-pop { animation: token-pop 160ms cubic-bezier(0.23, 1, 0.32, 1) both }
@media (prefers-reduced-motion: reduce) { .token-pop { animation: none } }
`;

type Found = Trigger & { node: Text; start: number; end: number };

/** `@` right before the caret — at the start or after a space — then letters. */
const readTrigger = (root: HTMLElement): Found | null => {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) {
    return null;
  }
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) {
    return null;
  }
  const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
  const match = /(?:^|\s)@(?<query>[\p{L}\p{N}_-]*)$/u.exec(before);
  if (!match) {
    return null;
  }
  const query = match.groups?.query ?? "";
  const start = sel.anchorOffset - query.length - 1;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, sel.anchorOffset);
  return {
    end: sel.anchorOffset,
    node: node as Text,
    query: query.toLowerCase(),
    rect: range.getBoundingClientRect(),
    start,
  };
};

const read = (root: HTMLElement): Segment[] => {
  const out: Segment[] = [];
  const walk = (n: Node) => {
    for (const child of n.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push((child.textContent ?? "").replaceAll(" ", " "));
      } else if (child instanceof HTMLElement && "token" in child.dataset) {
        out.push({
          id: child.dataset.id ?? "",
          label: child.dataset.label ?? "",
          logo: child.dataset.logo,
        });
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
  const end = merged.at(-1);
  if (typeof end === "string") {
    merged[merged.length - 1] = end.trimEnd();
  }
  return merged.filter((s) => s !== "");
};

/** Puts the caret at a point. */
const caretAt = (node: Node, offset: number) => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
};

export const TokenEditor = ({
  ref,
  placeholder,
  removeLabel,
  autoFocus,
  className,
  onEmptyChange,
  onChange,
  onTrigger,
  onKeyDown,
  onSubmit,
  modEnterSends = false,
}: {
  ref: React.Ref<EditorHandle>;
  placeholder: string;
  removeLabel: string;
  autoFocus?: boolean;
  className?: string;
  onEmptyChange: (empty: boolean) => void;
  /** The text changed: the field itself, to measure. */
  onChange?: (field: HTMLDivElement) => void;
  onTrigger: (t: Trigger | null) => void;
  /** Returns true when the key was handled (an open menu takes arrows, Enter, Tab, Esc). */
  onKeyDown: (e: React.KeyboardEvent) => boolean;
  onSubmit: () => void;
  /** ⌘/Ctrl+Enter sends and a plain Enter breaks the line, instead of the other way round. */
  modEnterSends?: boolean;
}) => {
  const root = useRef<HTMLDivElement>(null);
  const templates = useRef<HTMLDivElement>(null);
  const trigger = useRef<Found | null>(null);
  // Where the caret was when the field last lost the focus: a badge from the «+» menu lands there.
  const lastRange = useRef<Range | null>(null);
  // A key the menu took (an arrow moving its highlight) moved no caret: its keyup must not read the mention anew —
  // that would open the menu afresh, its highlight back on the first row.
  const taken = useRef<string | null>(null);

  const sync = useCallback(() => {
    const el = root.current;
    if (!el) {
      return;
    }
    const empty =
      !el.querySelector("[data-token]") && (el.textContent ?? "").trim() === "";
    el.dataset.empty = String(empty);
    if (empty && el.innerHTML !== "") {
      // A stray <br> keeps the placeholder away.
      el.innerHTML = "";
    }
    onEmptyChange(empty);
    onChange?.(el);
    trigger.current = readTrigger(el);
    onTrigger(trigger.current);
  }, [onChange, onEmptyChange, onTrigger]);

  useEffect(() => {
    if (root.current) {
      root.current.dataset.empty = "true";
    }
    if (autoFocus) {
      root.current?.focus();
    }
  }, [autoFocus]);

  useImperativeHandle(ref, () => ({
    addToken: (t) => {
      const el = root.current;
      if (!el) {
        return;
      }
      const sel = window.getSelection();
      const current =
        sel?.rangeCount && el.contains(sel.anchorNode)
          ? sel.getRangeAt(0)
          : null;
      const kept =
        lastRange.current && el.contains(lastRange.current.startContainer)
          ? lastRange.current
          : null;
      const range = document.createRange();
      const at = current ?? kept;
      if (at) {
        range.setStart(at.startContainer, at.startOffset);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.collapse(true);
      // Its own word: a space before it when it would stick to the text.
      const before = document.createRange();
      before.setStart(el, 0);
      before.setEnd(range.startContainer, range.startOffset);
      const glued = /\S$/u.test(before.toString());
      const space = document.createTextNode(" ");
      range.insertNode(space);
      range.insertNode(makeBadge(t, templates.current, removeLabel));
      if (glued) {
        range.insertNode(document.createTextNode(" "));
      }
      // …and no second space where the text after it already starts with one.
      const next = space.nextSibling;
      if (
        next?.nodeType === Node.TEXT_NODE &&
        next.textContent?.startsWith(" ")
      ) {
        next.textContent = next.textContent.slice(1);
      }
      caretAt(space, 1);
      el.focus();
      sync();
    },
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
      const space = document.createTextNode(" ");
      range.insertNode(space);
      range.insertNode(makeBadge(t, templates.current, removeLabel));
      caretAt(space, 1);
      el.focus();
      sync();
    },
    tokens: () =>
      root.current
        ? read(root.current).filter((s): s is Token => typeof s !== "string")
        : [],
    value: () => (root.current ? read(root.current) : []),
  }));

  /** Inserts plain text at the caret (a paste, a line break) without the browser's markup. */
  const insertText = (text: string) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) {
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    // A line break at the very end draws no new line (pre-wrap) until something follows it, and the caret stays up:
    // a second one waits after the caret — the text is trimmed when it goes, so it is never sent.
    const el = root.current;
    if (el && text.endsWith("\n")) {
      const rest = document.createRange();
      rest.setStart(node, text.length);
      rest.setEnd(el, el.childNodes.length);
      if (
        rest.toString() === "" &&
        !rest.cloneContents().querySelector("[data-token]")
      ) {
        node.after(document.createTextNode("\n"));
      }
    }
    caretAt(node, text.length);
    sync();
  };

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
          // One line however narrow the field — cut with an ellipsis, not wrapped under it — at the field's own padding.
          "data-[empty=true]:before:inset-x-0 data-[empty=true]:before:truncate data-[empty=true]:before:px-[inherit]",
          className
        )}
        contentEditable
        data-placeholder={placeholder}
        onBlur={() => {
          const sel = window.getSelection();
          if (sel?.rangeCount && root.current?.contains(sel.anchorNode)) {
            lastRange.current = sel.getRangeAt(0).cloneRange();
          }
        }}
        onClick={(e) => {
          const badge = (e.target as HTMLElement)
            .closest("[data-remove]")
            ?.closest<HTMLElement>("[data-token]");
          if (badge) {
            badge.remove();
            root.current?.focus();
          }
          sync();
        }}
        onInput={sync}
        onKeyDown={(e) => {
          if (onKeyDown(e)) {
            taken.current = e.key;
            return;
          }
          taken.current = null;
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            // Enter sends and Shift+Enter breaks the line — or, as the user chose, ⌘/Ctrl+Enter sends and Enter breaks it.
            const sends = modEnterSends ? e.metaKey || e.ctrlKey : !e.shiftKey;
            if (sends) {
              onSubmit();
            } else {
              insertText("\n");
            }
          }
        }}
        onKeyUp={(e) => {
          if (taken.current === e.key) {
            taken.current = null;
            return;
          }
          if (
            e.key.startsWith("Arrow") ||
            e.key === "Home" ||
            e.key === "End"
          ) {
            sync();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          insertText(e.clipboardData.getData("text/plain"));
        }}
        ref={root}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- inline badges need a contenteditable; a <textarea> holds text only
        role="textbox"
        spellCheck
        suppressContentEditableWarning
        tabIndex={0}
      />
    </>
  );
};
