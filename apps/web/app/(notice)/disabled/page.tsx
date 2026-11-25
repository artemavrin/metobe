import { Button } from "@metobe/ui/components/button";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(app)/(chat)/actions";
import { getContext } from "@/lib/context";

// What a person sees while their organization is turned off or the platform turned them off (ORGS-PLAN §6, ARCH §20.2):
// the (app) layout sends them here. Signed out — to sign-in; nothing turned off — back to the app.
const DisabledPage = async () => {
  const ctx = await getContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!ctx.gate) {
    redirect("/");
  }
  const [t, chat] = await Promise.all([
    getTranslations("disabled"),
    getTranslations("chat"),
  ]);
  const orgOff = ctx.gate === "org-disabled";
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        {orgOff ? t("orgTitle") : t("blockedTitle")}
      </h1>
      <p className="text-muted-foreground text-sm">
        {orgOff
          ? t(ctx.orgDisabledReason === "unpaid" ? "orgUnpaid" : "orgManual")
          : t("blockedText")}
      </p>
      <form action={signOut} className="mt-2">
        <Button type="submit" variant="outline">
          {chat("signOut")}
        </Button>
      </form>
    </div>
  );
};

export default DisabledPage;
