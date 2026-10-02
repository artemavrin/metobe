"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * «Looks like a password or a key»: one line where the draft is, with the way out — connect the service in «Мои
 * подключения», so the secret does not travel through the chat. Never blocks the send.
 */
export const SecretNote = () => {
  const t = useTranslations("chat.secret");
  return (
    <output className="animate-in fade-in inline-flex items-center gap-1.5 text-amber-700 duration-150 dark:text-amber-300">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span>
        {t("text")}{" "}
        <Link
          className="underline underline-offset-2"
          href="/settings/connections"
        >
          {t("link")}
        </Link>
      </span>
    </output>
  );
};
