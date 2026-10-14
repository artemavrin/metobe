"use client";

import { Button } from "@metobe/ui/components/button";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

import { StatusPage } from "@/components/status-page";

// Something broke while a screen was drawn: what happened in words, «try again», and the way to the chats. The
// details go to the console (and the server's log has the rest, by `digest`).
const AppError = ({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) => {
  const t = useTranslations("status.error");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPage
      icon={TriangleAlert}
      text={
        error.digest ? t("textWithCode", { code: error.digest }) : t("text")
      }
      title={t("title")}
    >
      <Button onClick={() => retry()}>{t("retry")}</Button>
      <Button nativeButton={false} render={<Link href="/" />} variant="outline">
        {t("home")}
      </Button>
    </StatusPage>
  );
};

export default AppError;
