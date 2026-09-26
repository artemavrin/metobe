import { Button } from "@metobe/ui/components/button";
import { getTranslations } from "next-intl/server";

import { signOut } from "./actions";

/** No model in chat yet: nothing to talk to. Only an admin can change that; they are sent to onboarding instead. */
export const NotReady = async () => {
  const [t, chat] = await Promise.all([
    getTranslations("onboarding.notReady"),
    getTranslations("chat"),
  ]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("text")}</p>
      <form action={signOut} className="mt-4">
        <Button type="submit" variant="outline">
          {chat("signOut")}
        </Button>
      </form>
    </main>
  );
};
