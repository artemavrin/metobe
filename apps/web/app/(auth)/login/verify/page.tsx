import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@purr/ui/components/card";

import { CodeForm } from "../login-form";

// The link only pre-fills the code: signing in is a POST, so mail scanners that open links cannot burn it.
const VerifyPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const { code = "", email = "" } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вход в Purr</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeForm email={email} initialCode={code} />
        </CardContent>
      </Card>
    </main>
  );
};

export default VerifyPage;
