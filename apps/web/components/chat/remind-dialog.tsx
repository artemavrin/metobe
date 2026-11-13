"use client";

import type {
  MemoryReminderDraft,
  MemorySuggestion,
} from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Input } from "@metobe/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { toast } from "@metobe/ui/components/sonner";
import { cn } from "@metobe/ui/lib/utils";
import { AtSign, Link2, Mail, MailX, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";

// «Напомнить» in «Не упустить» (Г2.4, P23 «Окно»): the letter to the one who owes, in a window that looks like the
// calendar's («Строки»): who to, from which box, the subject — a line each — and the words under them. The model of
// the slot «Память» writes them; «Короче» and «Мягче» ask it again. Where and when it was promised is shown to the
// person and does not go in the letter. No address on the card — a field, and the address is kept on the card; no mail
// — the letter is still there to copy, and «Подключить почту».

type Tone = "base" | "short" | "soft";

const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

const send = (url: string, method: string, body?: object) =>
  fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
    method,
  });

const Line = ({
  icon: Icon,
  children,
}: {
  icon: typeof Mail;
  children: React.ReactNode;
}) => (
  <div className="flex min-h-8 items-center gap-3 text-sm">
    <Icon className="text-muted-foreground size-4 shrink-0" />
    <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
  </div>
);

/** The model is writing: grey lines where the words will be. */
const Writing = () => {
  const t = useTranslations("memory.remind");
  return (
    <div aria-label={t("writing")} className="flex flex-col gap-2 py-1">
      {[92, 100, 76, 40].map((w) => (
        <span
          className="bg-muted h-3.5 animate-pulse rounded"
          key={w}
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
};

/** Where and when it was promised, the chat a link — for the person only. */
const Origin = ({ draft }: { draft: MemoryReminderDraft }) => {
  const t = useTranslations("memory.remind");
  const parts = [
    draft.given ? t("promised", { given: draft.given }) : null,
    draft.due ? t("due", { due: draft.due }) : null,
  ].filter(Boolean);
  if (!(draft.chat || parts.length > 0)) {
    return null;
  }
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <Link2 className="mt-px size-3.5 shrink-0" />
      <span>
        {parts.join(" · ")}
        {draft.chat && (
          <>
            {parts.length > 0 ? " · " : ""}
            <Link
              className="hover:text-foreground underline-offset-2 hover:underline"
              href={`/chat/${draft.chat.id}`}
            >
              {t("inChat", { chat: draft.chat.title })}
            </Link>
          </>
        )}
        <span className="text-muted-foreground/60"> · {t("notInLetter")}</span>
      </span>
    </p>
  );
};

/** No box to send from: the words to copy, and the way to connect one. */
const NoMailbox = ({ text }: { text: string }) => {
  const t = useTranslations("memory.remind");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <MailX className="size-3.5" /> {t("noMailbox")}
      </span>
      <Button
        className="ms-auto"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          toast(t("copied"));
        }}
        size="sm"
        variant="ghost"
      >
        {t("copy")}
      </Button>
      <Button
        nativeButton={false}
        render={<Link href="/settings/connections/mail/new" />}
        size="sm"
      >
        {t("connect")}
      </Button>
    </div>
  );
};

/**
 * The window's state: the row it is for, and the letter — asked for when «Напомнить» is pressed, and again for
 * «Короче» and «Мягче». An answer that comes after the window moved on to another row is dropped.
 */
export const useRemind = () => {
  const [row, setRow] = useState<MemorySuggestion | null>(null);
  const [draft, setDraft] = useState<MemoryReminderDraft | null>(null);
  const [tone, setTone] = useState<Tone>("base");
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const asked = useRef(0);
  const t = useTranslations("memory");
  const load = async (id: string, next: Tone) => {
    asked.current += 1;
    const mine = asked.current;
    setBusy(true);
    const response = await send(`/api/memory/records/${id}/reminder`, "POST", {
      tone: next,
    }).catch(() => null);
    const got = response?.ok
      ? ((await response.json()) as MemoryReminderDraft)
      : null;
    if (mine !== asked.current) {
      return;
    }
    setBusy(false);
    if (!got) {
      toast.error(t("failed"));
      return;
    }
    setDraft(got);
    // A subject the person changed stays; the words are the model's again.
    setSubject((s) => s || got.subject);
    setText(got.text);
  };
  return {
    busy,
    close: () => {
      asked.current += 1;
      setRow(null);
      setDraft(null);
      setSubject("");
      setText("");
      setTone("base");
      setBusy(false);
    },
    draft,
    open: (next: MemorySuggestion) => {
      setRow(next);
      setDraft(null);
      setSubject("");
      setText("");
      setTone("base");
      void load(next.id, "base");
    },
    pickTone: (next: Tone) => {
      setTone(next);
      if (row) {
        void load(row.id, next);
      }
    },
    row,
    setSubject,
    setText,
    subject,
    text,
    tone,
  };
};
type Remind = ReturnType<typeof useRemind>;

const ToneChips = ({ letter }: { letter: Remind }) => {
  const t = useTranslations("memory.remind");
  return (
    <div className="mt-2 flex gap-1">
      {(["short", "soft"] as const).map((tone) => (
        <button
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150 disabled:opacity-50",
            letter.tone === tone
              ? "bg-foreground text-background border-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          disabled={letter.busy}
          key={tone}
          onClick={() => letter.pickTone(letter.tone === tone ? "base" : tone)}
          type="button"
        >
          {t(tone)}
        </button>
      ))}
    </div>
  );
};

/** Who the letter goes to and from which box: the card's address, or a field for one; the box, or a choice of them. */
const Addresses = ({
  draft,
  address,
  onAddress,
  mailbox,
  onMailbox,
}: {
  draft: MemoryReminderDraft;
  address: string;
  onAddress: (v: string) => void;
  mailbox: string;
  onMailbox: (v: string) => void;
}) => {
  const t = useTranslations("memory.remind");
  return (
    <>
      <Line icon={AtSign}>
        {draft.to.email ? (
          <span className="flex min-w-0 flex-wrap gap-x-1">
            {draft.to.name}
            <span className="text-muted-foreground break-all">
              &lt;{draft.to.email}&gt;
            </span>
          </span>
        ) : (
          <div className="flex flex-1 flex-col gap-1 py-1">
            <Input
              aria-label={t("address", { name: draft.to.name })}
              className="h-8"
              onChange={(e) => onAddress(e.target.value)}
              placeholder={t("address", { name: draft.to.name })}
              type="email"
              value={address}
            />
            <span className="text-muted-foreground text-xs">
              {t("addressHint", { name: draft.to.name })}
            </span>
          </div>
        )}
      </Line>
      {draft.boxes.length > 0 && (
        <Line icon={Mail}>
          {draft.boxes.length === 1 ? (
            <span className="text-muted-foreground truncate">
              {t("from", { address: mailbox })}
            </span>
          ) : (
            <Select
              onValueChange={(v) => onMailbox(v as string)}
              value={mailbox}
            >
              <SelectTrigger className="text-muted-foreground w-auto border-0 px-0 shadow-none">
                <SelectValue>{t("from", { address: mailbox })}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {draft.boxes.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Line>
      )}
    </>
  );
};

/** Sends it: the address kept on the card first if it was typed here, then the letter. */
const useSend = (row: MemorySuggestion, onSent: () => void) => {
  const t = useTranslations("memory.remind");
  const [sending, setSending] = useState(false);
  return {
    sendLetter: async (input: {
      draft: MemoryReminderDraft;
      to: string;
      subject: string;
      text: string;
      mailbox: string;
    }) => {
      setSending(true);
      if (!input.draft.to.email) {
        await send(`/api/memory/cards/${input.draft.to.id}`, "PATCH", {
          email: input.to,
        });
      }
      const response = await send(
        `/api/memory/records/${row.id}/reminder/send`,
        "POST",
        {
          mailbox: input.mailbox,
          subject: input.subject,
          text: input.text,
          to: input.to,
        }
      ).catch(() => null);
      setSending(false);
      if (response?.ok) {
        toast(t("sent", { name: input.draft.to.name }));
        onSent();
        return;
      }
      const error = response
        ? (
            (await response.json().catch(() => null)) as {
              error?: string;
            } | null
          )?.error
        : null;
      toast.error(t("notSent", { error: error ?? "—" }));
    },
    sending,
  };
};

const Letter = ({
  row,
  letter,
  onSent,
}: {
  row: MemorySuggestion;
  letter: Remind;
  onSent: () => void;
}) => {
  const t = useTranslations("memory.remind");
  const [address, setAddress] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const { sending, sendLetter } = useSend(row, onSent);
  const { draft } = letter;
  if (!draft) {
    return <Writing />;
  }
  const to = draft.to.email ?? address.trim();
  const mailbox = chosen ?? draft.boxes[0] ?? "";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <Addresses
          address={address}
          draft={draft}
          mailbox={mailbox}
          onAddress={setAddress}
          onMailbox={setChosen}
        />
        <Line icon={Type}>
          <input
            aria-label={t("subject")}
            className="w-full bg-transparent outline-none"
            onChange={(e) => letter.setSubject(e.target.value)}
            value={letter.subject}
          />
        </Line>
      </div>
      <div className="border-t pt-3">
        {letter.busy ? (
          <Writing />
        ) : (
          <textarea
            aria-label={t("text")}
            className={cn(
              "[field-sizing:content] min-h-28 w-full resize-none bg-transparent text-sm leading-6 outline-none",
              ENTER
            )}
            onChange={(e) => letter.setText(e.target.value)}
            value={letter.text}
          />
        )}
        {draft.by === "model" && <ToneChips letter={letter} />}
      </div>
      <Origin draft={draft} />
      <div className="border-t pt-3">
        {draft.boxes.length > 0 ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {t(draft.by === "model" ? "byModel" : "byTemplate")}
            </span>
            <Button
              disabled={
                letter.busy ||
                sending ||
                !to.includes("@") ||
                !letter.subject.trim() ||
                !letter.text.trim()
              }
              onClick={() =>
                sendLetter({
                  draft,
                  mailbox,
                  subject: letter.subject,
                  text: letter.text,
                  to,
                })
              }
            >
              {t("send")}
            </Button>
          </div>
        ) : (
          <NoMailbox text={`${letter.subject}\n\n${letter.text}`} />
        )}
      </div>
    </div>
  );
};

/** The window, open while `remind.row` is set. */
export const RemindDialog = ({
  remind,
  onSent,
}: {
  remind: Remind;
  onSent: (row: MemorySuggestion) => void;
}) => {
  const t = useTranslations("memory.remind");
  const { row } = remind;
  return (
    <Dialog
      onOpenChange={(open) => !open && remind.close()}
      open={row !== null}
    >
      {row && (
        <DialogContent className="gap-4 p-5 pb-4 sm:max-w-[28rem]">
          <DialogTitle className="text-muted-foreground text-xs font-normal">
            {t("title", { name: row.who?.name ?? "" })}
          </DialogTitle>
          <Letter
            key={row.id}
            letter={remind}
            onSent={() => {
              onSent(row);
              remind.close();
            }}
            row={row}
          />
        </DialogContent>
      )}
    </Dialog>
  );
};
