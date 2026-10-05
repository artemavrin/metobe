import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthHeading, stepEnter } from "@/components/auth/auth-heading";
import { getAuth } from "@/lib/auth";

import { NameForm } from "./name-form";

// The step after a first sign-in by a code: the account exists, only the name is missing. Not for anyone signed out,
// and not for anyone who has a name.
const NamePage = async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  if (session.user.name.trim()) {
    redirect("/");
  }
  const t = await getTranslations("login.name");
  return (
    <div className={stepEnter()}>
      <AuthHeading title={t("title")}>{t("description")}</AuthHeading>
      <NameForm />
    </div>
  );
};

export default NamePage;
