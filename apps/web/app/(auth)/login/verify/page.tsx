import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@metobe/ui/components/card";
import { getTranslations } from "next-intl/server";

import { CodeForm } from "../login-form";

// The link only pre-fills the code: signing in is a POST, so mail scanners that open links cannot burn it.
const VerifyPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const { code = "", email = "" } = await searchParams;
  const t = await getTranslations("login");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeForm email={email} initialCode={code} />
        </CardContent>
      </Card>
    </main>
  );
};

export default VerifyPage;
