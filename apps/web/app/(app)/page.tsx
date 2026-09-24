import { Button } from "@metobe/ui/components/button";
import { headers } from "next/headers";
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
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Metobe</h1>
      <p className="text-muted-foreground">
        Вы вошли как {session?.user.email}
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Выйти
        </Button>
      </form>
    </main>
  );
};

export default HomePage;
