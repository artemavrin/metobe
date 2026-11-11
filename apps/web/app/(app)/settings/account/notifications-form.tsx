"use client";

import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { Row, Rows } from "@/components/settings/rows";

import {
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

/** Telegram (D43): bind a chat with a link to the bot; while it waits for «Start», the state is asked every few seconds. */
const TelegramRow = ({
  channel,
  onChannel,
}: {
  channel: Channel | null;
  onChannel: (channel: Channel | null) => void;
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
            <Button
              disabled={pending}
              onClick={check}
              size="sm"
              variant="outline"
            >
              {pending && <Spinner />}
              {t("test")}
            </Button>
            <Button
              disabled={pending}
              onClick={unlink}
              size="sm"
              variant="ghost"
            >
              {t("unlink")}
            </Button>
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

/** Where Metobe tells the person (D43): the mail, and — while the installation has a bot — a Telegram chat. */
export const NotificationsForm = ({
  channel: initial,
  telegram: botOn,
  email: initialEmail,
  viaTelegram: initialVia,
}: {
  channel: Channel | null;
  /** The installation has a bot: Telegram is offered. */
  telegram: boolean;
  email: boolean;
  viaTelegram: boolean;
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
      {botOn && <TelegramRow channel={channel} onChannel={setChannel} />}
      {botOn && channel?.status === "active" && (
        <Row hint={t("viaTelegramHint")} label={t("viaTelegram")}>
          <Switch
            aria-label={t("viaTelegram")}
            checked={viaTelegram}
            disabled={pending}
            onCheckedChange={(next) => choose({ telegram: next })}
          />
        </Row>
      )}
    </Rows>
  );
};
