"use client";

import { cn } from "@metobe/ui/lib/utils";
import { ChevronLeft, Inbox as InboxIcon, Paperclip, Reply, Star } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { Picker } from "../_shared/picker";
import type { Locale } from "./letters/kit";

// The harness: a mail client around the letter — the list with ours on top (subject, then the preview line) and the
// reading pane with the letter in a frame, as a client shows it. «Параметры»: a computer or a phone, a light or a
// dark client, the language, the letter or its plain-text part.

export type VariantId = "code" | "button" | "note" | "context";
export type Rendered = Record<VariantId, Record<Locale, { html: string; text: string; subject: string; preview: string }>>;
export type Inbox = { at: string; from: string; subject: string; snippet: string }[];

interface Data {
  letters: Rendered;
  inbox: Inbox;
  sender: { name: string; address: string };
  sentAt: string;
  timeZone: string | null;
}

interface Params {
  phone: boolean;
  dark: boolean;
  locale: Locale;
  text: boolean;
}

const DataContext = createContext<Data | null>(null);
const ParamsContext = createContext<{ params: Params; set: (p: Partial<Params>) => void } | null>(null);

const useData = () => useContext(DataContext) as Data;
const useParams = () => useContext(ParamsContext) as NonNullable<React.ContextType<typeof ParamsContext>>;

/** The client's own colours: a light or a dark mail app, whatever the product's theme is. */
const SKIN = {
  dark: {
    app: "bg-zinc-950 text-zinc-100",
    border: "border-zinc-800",
    muted: "text-zinc-400",
    pane: "bg-zinc-900",
    selected: "bg-blue-500/15",
    side: "bg-zinc-950",
  },
  light: {
    app: "bg-zinc-100 text-zinc-900",
    border: "border-zinc-200",
    muted: "text-zinc-500",
    pane: "bg-white",
    selected: "bg-blue-50",
    side: "bg-zinc-50",
  },
};

const WORDS = {
  en: { inbox: "Inbox", now: "now", to: "to me" },
  ru: { inbox: "Входящие", now: "сейчас", to: "кому: мне" },
};

/**
 * The letter's document as a client opens it: links open aside, and in a dark client its dark styles apply, as Apple
 * Mail does with a letter that allows both schemes (a frame's own prefers-color-scheme can't be set from outside).
 */
const docOf = (html: string, dark: boolean) => {
  const doc = html.replace("<head>", '<head><base target="_blank">');
  return dark
    ? doc
        .replaceAll("@media (prefers-color-scheme: dark)", "@media all")
        .replace("<head>", "<head><style>:root { color-scheme: dark; }</style>")
    : doc;
};

/** The letter as a client frames it: its own document, as tall as it is. */
const Frame = ({ html, dark }: { html: string; dark: boolean }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  const fit = () => {
    const doc = ref.current?.contentDocument;
    if (doc) {
      setHeight(doc.documentElement.scrollHeight);
    }
  };
  useEffect(fit, [html, dark]);
  return (
    <iframe
      className="block w-full border-0"
      key={`${dark}`}
      onLoad={fit}
      ref={ref}
      srcDoc={docOf(html, dark)}
      style={{ height }}
      title="letter"
    />
  );
};

const Avatar = ({ name }: { name: string }) => (
  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">
    {name.slice(0, 1).toUpperCase()}
  </span>
);

const timeOf = (iso: string, timeZone: string | null) =>
  new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: timeZone ?? undefined }).format(
    new Date(iso)
  );

/** The reading pane: the subject, who it is from and to, the letter. */
const Reading = ({ id }: { id: VariantId }) => {
  const { letters, sender, sentAt, timeZone } = useData();
  const { params } = useParams();
  const letter = letters[id][params.locale];
  const skin = params.dark ? SKIN.dark : SKIN.light;
  const w = WORDS[params.locale];
  return (
    <>
      <header className={cn("border-b px-5 pt-5 pb-4 md:px-8 md:pt-7", skin.border)}>
        <h1 className="text-lg font-semibold tracking-tight md:text-xl">{letter.subject}</h1>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={sender.name} />
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate">
              <span className="font-semibold">{sender.name}</span>{" "}
              <span className={skin.muted}>&lt;{sender.address}&gt;</span>
            </div>
            <div className={cn("text-xs", skin.muted)}>{w.to}</div>
          </div>
          <span className={cn("shrink-0 text-xs", skin.muted)}>{timeOf(sentAt, timeZone)}</span>
          {!params.phone && (
            <span className={cn("flex gap-3", skin.muted)}>
              <Star className="size-4" />
              <Reply className="size-4" />
            </span>
          )}
        </div>
      </header>
      {params.text ? (
        <pre className="px-5 py-6 font-mono text-[13px] leading-relaxed whitespace-pre-wrap md:px-8">{letter.text}</pre>
      ) : (
        <Frame dark={params.dark} html={letter.html} />
      )}
    </>
  );
};

/** The list: ours on top, unread and selected, then the user's last letters. */
const List = ({ id }: { id: VariantId }) => {
  const { letters, inbox, sender, timeZone } = useData();
  const { params } = useParams();
  const skin = params.dark ? SKIN.dark : SKIN.light;
  const letter = letters[id][params.locale];
  const w = WORDS[params.locale];
  return (
    <aside className={cn("flex w-80 shrink-0 flex-col border-r", skin.side, skin.border)}>
      <div className={cn("flex h-14 items-center gap-2 border-b px-4 font-semibold", skin.border)}>
        <InboxIcon className="size-4" />
        {w.inbox}
      </div>
      <ul className="flex-1 overflow-y-auto">
        <li className={cn("border-b border-l-2 border-l-blue-600 px-4 py-3", skin.selected, skin.border)}>
          <div className="flex items-baseline gap-2">
            <span className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-blue-600" />
            <span className="flex-1 truncate text-sm font-semibold">{sender.name}</span>
            <span className={cn("text-xs", skin.muted)}>{w.now}</span>
          </div>
          <div className="mt-0.5 truncate pl-4 text-sm font-medium">{letter.subject}</div>
          <div className={cn("line-clamp-2 pl-4 text-xs leading-snug", skin.muted)}>{letter.preview}</div>
        </li>
        {inbox.map((m) => (
          <li className={cn("border-b px-4 py-3", skin.border)} key={`${m.at}${m.subject}`}>
            <div className="flex items-baseline gap-2 pl-4">
              <span className="flex-1 truncate text-sm">{m.from}</span>
              <span className={cn("text-xs", skin.muted)}>{timeOf(m.at, timeZone)}</span>
            </div>
            <div className="truncate pl-4 text-sm">{m.subject}</div>
            <div className={cn("line-clamp-1 pl-4 text-xs", skin.muted)}>{m.snippet}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
};

/** One variant in the client: two panes on a computer, the reading pane in a phone's frame. */
const Client = ({ id }: { id: VariantId }) => {
  const { params } = useParams();
  const skin = params.dark ? SKIN.dark : SKIN.light;
  const w = WORDS[params.locale];
  if (params.phone) {
    return (
      <div className={cn("flex min-h-dvh items-start justify-center py-8", params.dark ? "bg-black" : "bg-zinc-200")}>
        <div className={cn("w-[390px] overflow-hidden rounded-[2.5rem] border-8 shadow-xl", params.dark ? "border-zinc-800" : "border-zinc-900", skin.app)}>
          <div className={cn("h-[780px] overflow-y-auto", skin.pane)}>
            <div className="flex h-11 items-center gap-1 px-3 text-sm text-blue-500">
              <ChevronLeft className="size-5" />
              {w.inbox}
            </div>
            <Reading id={id} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex h-dvh", skin.app)}>
      <List id={id} />
      <main className={cn("flex-1 overflow-y-auto", skin.pane)}>
        <Reading id={id} />
        <div className={cn("flex items-center gap-2 px-8 pt-2 pb-24 text-xs", skin.muted)}>
          <Paperclip className="size-3.5" />
          {params.text ? "text/plain" : "text/html + text/plain"}
        </div>
      </main>
    </div>
  );
};

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn(
      "rounded-full px-2.5 py-1 transition-colors duration-150",
      active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85"
    )}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const Choice = <T,>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="flex items-center justify-between gap-4">
    <span>{label}</span>
    <div className="flex gap-1">
      {options.map(([v, text]) => (
        <Chip active={v === value} key={text} onClick={() => onChange(v)}>
          {text}
        </Chip>
      ))}
    </div>
  </div>
);

const ProtoParams = () => {
  const { params, set } = useParams();
  return (
    <>
      <Choice label="экран" onChange={(phone) => set({ phone })} options={[[false, "компьютер"], [true, "телефон"]]} value={params.phone} />
      <Choice label="клиент" onChange={(dark) => set({ dark })} options={[[false, "светлый"], [true, "тёмный"]]} value={params.dark} />
      <Choice label="язык" onChange={(locale) => set({ locale })} options={[["ru" as Locale, "русский"], ["en" as Locale, "english"]]} value={params.locale} />
      <Choice label="вид" onChange={(text) => set({ text })} options={[[false, "письмо"], [true, "текст"]]} value={params.text} />
    </>
  );
};

const of = (id: VariantId) => () => <Client id={id} />;

export const Prototype = (data: Data) => {
  const [params, setParams] = useState<Params>({ dark: false, locale: "ru", phone: false, text: false });
  return (
    <DataContext value={data}>
      <ParamsContext value={{ params, set: (p) => setParams((prev) => ({ ...prev, ...p })) }}>
        <Picker
          params={<ProtoParams />}
          variants={[
            { Component: of("code"), name: "Код" },
            { Component: of("button"), name: "Кнопка" },
            { Component: of("note"), name: "Записка" },
            { Component: of("context"), name: "Контекст" },
          ]}
        />
      </ParamsContext>
    </DataContext>
  );
};
