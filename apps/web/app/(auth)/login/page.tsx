import { isMailConfigured } from "@metobe/core/mail";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metobe/ui/components/card";
import { connection } from "next/server";

import { LoginForm } from "./login-form";

// Functional placeholder; the real look comes from prototype P1.
const LoginPage = async () => {
  // Mail settings are read per request, not frozen at build time.
  await connection();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вход в Metobe</CardTitle>
          <CardDescription>
            Пришлём ссылку и код — пароль не нужен.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm mailConfigured={isMailConfigured()} />
        </CardContent>
      </Card>
    </main>
  );
};

export default LoginPage;
