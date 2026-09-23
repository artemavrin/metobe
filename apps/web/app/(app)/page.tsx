import { Button } from "@purr/ui/components/button";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

const signOut = async () => {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
};

// Temporary home until the chat screen (M3).
const HomePage = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Purr</h1>
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
