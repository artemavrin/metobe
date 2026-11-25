import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LastPage } from "@/components/last-page";
import { getContext } from "@/lib/context";

// `modal` is the slot of the settings window (app/(app)/@modal): opened from inside the app it shows over the page.
const AppLayout = async ({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) => {
  // headers() first: it marks the route dynamic before auth (and its env) is touched.
  await headers();
  const ctx = await getContext();
  if (!ctx) {
    redirect("/login");
  }
  // The organization or the person is turned off: nothing of the app works, the screen says why (ARCH §20.2).
  if (ctx.gate) {
    redirect("/disabled");
  }
  // An account made by a first sign-in has no name until it is asked for.
  if (!ctx.user.name.trim()) {
    redirect("/login/name");
  }
  return (
    <>
      <LastPage />
      {children}
      {modal}
    </>
  );
};

export default AppLayout;
