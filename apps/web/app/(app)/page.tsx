import { Button } from "@metobe/ui/components/button";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

const signOut = async () => {
  "use server";
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
};

// Temporary home until the chat screen (M3).
const HomePage = async () => {
  // headers() first: it marks the route dynamic before auth (and its env) is touched.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  const t = await getTranslations("home");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Metobe</h1>
      <p className="text-muted-foreground">
        {t("signedInAs", { email: session?.user.email ?? "" })}
      </p>
      <Link
        className="text-primary text-sm underline-offset-4 hover:underline"
        href="/settings/region"
      >
        {t("region")}
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
