import { hasSuperuser } from "@metobe/core/claim";
import { Button } from "@metobe/ui/components/button";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AuthHeading, stepEnter } from "@/components/auth/auth-heading";

import { ClaimForm } from "./claim-form";

const ClaimPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const { token = "" } = await searchParams;
  const claimed = await hasSuperuser();
  const t = await getTranslations("claim");
  return (
    <div className={stepEnter()}>
      <AuthHeading title={t("title")}>
        {claimed ? t("claimed") : t("first")}
      </AuthHeading>
      {claimed ? (
        <Button
          className="h-10 w-full"
          nativeButton={false}
          render={<Link href="/login" />}
          variant="outline"
        >
          {t("toLogin")}
        </Button>
      ) : (
        <ClaimForm token={token} />
      )}
    </div>
  );
};

export default ClaimPage;
