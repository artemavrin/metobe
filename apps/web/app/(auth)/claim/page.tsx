import { hasSuperuser } from "@purr/core/claim";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@purr/ui/components/card";
import Link from "next/link";

import { ClaimForm } from "./claim-form";

// Functional placeholder; the real look comes from prototype P1.
const ClaimPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const { token = "" } = await searchParams;
  const claimed = await hasSuperuser();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Аккаунт администратора</CardTitle>
          <CardDescription>
            {claimed
              ? "Администратор уже создан."
              : "Первый шаг после установки. Пароль не нужен."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claimed ? (
            <Link
              className="text-primary text-sm underline-offset-4 hover:underline"
              href="/login"
            >
              Перейти ко входу
            </Link>
          ) : (
            <ClaimForm token={token} />
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default ClaimPage;
