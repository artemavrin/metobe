import { Button } from "@metobe/ui/components/button";
import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { StatusPage } from "@/components/status-page";

/** A chat, a source or an address that is not there (or not this person's): said so, with the way to the chats. */
export const NotFoundPage = async () => {
  const t = await getTranslations("status.notFound");
  return (
    <StatusPage icon={SearchX} text={t("text")} title={t("title")}>
      <Button nativeButton={false} render={<Link href="/" />}>
        {t("home")}
      </Button>
    </StatusPage>
  );
};
