import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LastPage } from "@/components/last-page";
import { getAuth } from "@/lib/auth";

// `modal` is the slot of the settings window (app/(app)/@modal): opened from inside the app it shows over the page.
const AppLayout = async ({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) => {
  // headers() first: it marks the route dynamic before auth (and its env) is touched.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) {
    redirect("/login");
  }
  // An account made by a first sign-in has no name until it is asked for.
  if (!session.user.name.trim()) {
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
