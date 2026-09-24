import { isMailConfigured } from "@metobe/core/mail";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metobe/ui/components/card";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";

import { LanguageSelect } from "@/components/language-select";

import { LoginForm } from "./login-form";

// Functional placeholder; the real look comes from prototype P1.
const LoginPage = async () => {
  // Mail settings are read per request, not frozen at build time.
  await connection();
  const t = await getTranslations("login");
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm mailConfigured={isMailConfigured()} />
        </CardContent>
      </Card>
      <LanguageSelect className="absolute top-4 right-4" />
    </main>
  );
};

export default LoginPage;
