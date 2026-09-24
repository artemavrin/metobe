import { hasSuperuser } from "@metobe/core/claim";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metobe/ui/components/card";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { LanguageSelect } from "@/components/language-select";

import { ClaimForm } from "./claim-form";

// Functional placeholder; the real look comes from prototype P1.
const ClaimPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const { token = "" } = await searchParams;
  const claimed = await hasSuperuser();
  const t = await getTranslations("claim");
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {claimed ? t("claimed") : t("first")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claimed ? (
            <Link
              className="text-primary text-sm underline-offset-4 hover:underline"
              href="/login"
            >
              {t("toLogin")}
            </Link>
          ) : (
            <ClaimForm token={token} />
          )}
        </CardContent>
      </Card>
      <LanguageSelect className="absolute top-4 right-4" />
    </main>
  );
};

export default ClaimPage;
