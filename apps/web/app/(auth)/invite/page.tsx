import { previewInvitation } from "@metobe/core/invitations";
import { Button } from "@metobe/ui/components/button";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AuthHeading, stepEnter } from "@/components/auth/auth-heading";

import { InviteForm } from "./invite-form";

const InvitePage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const { token = "" } = await searchParams;
  const invitation = token ? await previewInvitation(token) : null;
  const t = await getTranslations("invite");
  return (
    <div className={stepEnter()}>
      <AuthHeading title={t("title")}>
        {invitation ? t("first") : t("invalidToken")}
      </AuthHeading>
      {invitation ? (
        <InviteForm email={invitation.email} token={token} />
      ) : (
        <Button
          className="h-10 w-full"
          nativeButton={false}
          render={<Link href="/login" />}
          variant="outline"
        >
          {t("toLogin")}
        </Button>
      )}
    </div>
  );
};

export default InvitePage;
