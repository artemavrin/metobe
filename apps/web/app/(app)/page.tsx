import { listChatModels } from "@metobe/core/sources-read";
import { Button } from "@metobe/ui/components/button";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { getSettingsViewer } from "@/lib/settings-access";

const signOut = async () => {
  "use server";
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
};

/** No model in chat yet: nothing to talk to. Only an admin can change that; they are there already. */
const NotReady = async () => {
  const [t, home] = await Promise.all([
    getTranslations("onboarding.notReady"),
    getTranslations("home"),
  ]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("text")}</p>
      <form action={signOut} className="mt-4">
        <Button type="submit" variant="outline">
          {home("signOut")}
        </Button>
      </form>
    </main>
  );
};

// Temporary home until the chat screen (M3).
const HomePage = async () => {
  // headers() first: it marks the route dynamic before auth (and its env) is touched.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  // Chat opens once any source puts a model into it; until then an admin sets it up, anyone else waits.
  const [{ admin }, chat] = await Promise.all([
    getSettingsViewer(),
    listChatModels(),
  ]);
  if (chat.length === 0) {
    if (admin) {
      redirect("/onboarding");
    }
    return <NotReady />;
  }
  const t = await getTranslations("home");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Metobe</h1>
      <p className="text-muted-foreground">
        {t("signedInAs", { email: session?.user.email ?? "" })}
      </p>
      <Link
        className="text-primary text-sm underline-offset-4 hover:underline"
        href="/settings"
      >
        {t("settings")}
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          {t("signOut")}
        </Button>
      </form>
    </main>
  );
};

export default HomePage;
