"use client";

import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { turnOffTaskMailAction } from "./actions";

/** The one button: the page shows «выключены» once it went through. */
export const MailOffForm = ({
  taskId,
  token,
}: {
  taskId: string;
  token: string;
}) => {
  const t = useTranslations("mailOff");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { ok } = await turnOffTaskMailAction(taskId, token);
            setFailed(!ok);
          })
        }
      >
        {pending && <Spinner className="size-4" />}
        {t("button")}
      </Button>
      {failed && (
        <p className="text-destructive text-sm" role="alert">
          {t("failed")}
        </p>
      )}
    </div>
  );
};
