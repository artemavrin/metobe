import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

const AppLayout = async ({ children }: { children: React.ReactNode }) => {
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
  return children;
};

export default AppLayout;
