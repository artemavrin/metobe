import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metobe/ui/components/card";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getPrefs } from "@/lib/prefs";

import { RegionForm } from "./region-form";

// Functional placeholder; the real look arrives with user settings in the shell.
const RegionPage = async () => {
  const [prefs, t] = await Promise.all([getPrefs(), getTranslations("region")]);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <RegionForm
            chosen={prefs.chosen}
            locale={prefs.locale}
            timeZones={Intl.supportedValuesOf("timeZone")}
          />
          <Link
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
            href="/"
          >
            {t("back")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
};

export default RegionPage;
