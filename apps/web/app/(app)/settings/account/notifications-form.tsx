"use client";

import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { TimePicker } from "@metobe/ui/components/reui/time-picker";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { Ellipsis, Send, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { Row, Rows } from "@/components/settings/rows";

import {
  saveDigest,
  saveNotify,
  startTelegram,
  telegramStatus,
  testTelegram,
  unlinkTelegramChat,
} from "./notifications-actions";

interface Channel {
  status: "pending" | "active" | "error";
  display: string | null;
  lastError: string | null;
}

const POLL_MS = 3000;
/** The time a digest starts at when the person turns it on. */
const DEFAULT_DIGEST = "09:00";

/**
 * Telegram (D43) in one row: not bound — «Привязать»; waiting for «Start» in the bot — the link and «Отмена»; bound —
 * the chat and a switch for sending, with «Проверить» and «Отвязать» in the menu. While it waits, the state is asked
 * every few seconds.
 */
const TelegramRow = ({
  channel,
  onChannel,
  via,
  onVia,
}: {
  channel: Channel | null;
  onChannel: (channel: Channel | null) => void;
  via: boolean;
  onVia: (on: boolean) => void;
}) => {
  const t = useTranslations("settings.notifications");
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const waiting = channel?.status === "pending";

  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(async () => {
      onChannel(await telegramStatus());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, onChannel]);

  const bind = () =>
    start(async () => {
      setNote(null);
      const result = await startTelegram();
      if (!result.ok) {
        setNote(t("linkFailed"));
        return;
      }
      setLink(result.url);
      onChannel({ display: null, lastError: null, status: "pending" });
      // The link opens at once: the bot's chat is where the person goes next.
      window.open(result.url, "_blank", "noopener");
    });

  const check = () =>
    start(async () => {
      const result = await testTelegram();
      if (result.ok) {
        setNote(t("testSent"));
        return;
      }
      setNote(t("testFailed"));
      onChannel(await telegramStatus());
    });

  const unlink = () =>
    start(async () => {
      await unlinkTelegramChat();
      onChannel(null);
      setLink(null);
      setNote(null);
    });

  let hint = t("telegramHint");
  if (channel?.status === "active") {
    hint = t("linked", { name: channel.display ?? "Telegram" });
  } else if (channel?.status === "error") {
    hint = t("blocked");
  } else if (waiting) {
    hint = t("waiting");
  }

  return (
    <Row hint={note ?? hint} label={t("telegram")}>
      <div className="flex items-center gap-2">
        {channel?.status === "active" && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("more")}
                    disabled={pending}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                {pending ? <Spinner /> : <Ellipsis />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={check}>
                  <Send /> {t("test")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={unlink}>
                  <Unlink /> {t("unlink")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Switch
              aria-label={t("viaTelegram")}
              checked={via}
              disabled={pending}
              onCheckedChange={onVia}
            />
          </>
        )}
        {waiting && link && (
          <Button
            nativeButton={false}
            render={
              <Link
                href={link}
                prefetch={false}
                rel="noreferrer"
                target="_blank"
              />
            }
            size="sm"
            variant="outline"
          >
            {t("open")}
          </Button>
        )}
        {waiting && (
          <Button disabled={pending} onClick={unlink} size="sm" variant="ghost">
            {t("cancel")}
          </Button>
        )}
        {(!channel || channel.status === "error") && (
          <Button disabled={pending} onClick={bind} size="sm" variant="outline">
            {pending && <Spinner />}
            {channel ? t("relink") : t("link")}
          </Button>
        )}
      </div>
    </Row>
  );
};

/** The morning digest of «Не упустить»: a switch and the time it comes at — always in sight, off or on. */
const DigestRow = ({ initial }: { initial: string | null }) => {
  const t = useTranslations("settings.notifications");
  const [time, setTime] = useState(initial ?? DEFAULT_DIGEST);
  const [on, setOn] = useState(initial !== null);
  const [pending, start] = useTransition();

  const save = (next: { time: string; on: boolean }) => {
    setTime(next.time);
    setOn(next.on);
    start(async () => {
      const result = await saveDigest(next.on ? next.time : null);
      if (!result.ok) {
        setTime(initial ?? DEFAULT_DIGEST);
        setOn(initial !== null);
      }
    });
  };

  return (
    <Row hint={t("digestHint")} label={t("digest")}>
      <div className="flex items-center gap-2">
        <TimePicker
          aria-label={t("digestTime")}
          className="w-28"
          disabled={pending || !on}
          hourCycle={24}
          i18n={{
            labels: {
              clear: t("timeClear"),
              confirm: t("timeOk"),
              hour: t("timeHour"),
              minute: t("timeMinute"),
              now: t("timeNow"),
              openPicker: t("digestTime"),
              panelLabel: t("digestTime"),
              placeholder: t("timePlaceholder"),
            },
          }}
          minuteStep={5}
          onValueChange={(next) => {
            if (next) {
              save({ on, time: next });
            }
          }}
          value={time}
        />
        <Switch
          aria-label={t("digest")}
          checked={on}
          disabled={pending}
          onCheckedChange={(next) => save({ on: next, time })}
        />
      </div>
    </Row>
  );
};

/** Where Metobe tells the person (D43): the mail, the morning digest, and — while the installation has a bot — Telegram. */
export const NotificationsForm = ({
  channel: initial,
  telegram: botOn,
  email: initialEmail,
  viaTelegram: initialVia,
  digest,
  memory,
}: {
  channel: Channel | null;
  /** The installation has a bot: Telegram is offered. */
  telegram: boolean;
  email: boolean;
  viaTelegram: boolean;
  /** The digest's time, `09:00`; null — off. */
  digest: string | null;
  /** The service has a «Память» model: there is a digest to send. */
  memory: boolean;
}) => {
  const t = useTranslations("settings.notifications");
  const [channel, setChannel] = useState<Channel | null>(initial);
  const [email, setEmail] = useState(initialEmail);
  const [viaTelegram, setViaTelegram] = useState(initialVia);
  const [pending, start] = useTransition();

  const choose = (next: { email?: boolean; telegram?: boolean }) => {
    setEmail(next.email ?? email);
    setViaTelegram(next.telegram ?? viaTelegram);
    start(async () => {
      const result = await saveNotify(next);
      if (!result.ok) {
        setEmail(initialEmail);
        setViaTelegram(initialVia);
      }
    });
  };

  return (
    <Rows>
      <Row hint={t("emailHint")} label={t("email")}>
        <Switch
          aria-label={t("email")}
          checked={email}
          disabled={pending}
          onCheckedChange={(next) => choose({ email: next })}
        />
      </Row>
      {botOn && (
        <TelegramRow
          channel={channel}
          onChannel={setChannel}
          onVia={(on) => choose({ telegram: on })}
          via={viaTelegram}
        />
      )}
      {memory && <DigestRow initial={digest} />}
    </Rows>
  );
};
