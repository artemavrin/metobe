import { canInvite, invitableRoles } from "@metobe/contracts/members";
import { actorOf } from "@metobe/core/context";
import { listOpenInvitations } from "@metobe/core/invitations";
import { isMailConfigured } from "@metobe/core/mail";
import { notFound } from "next/navigation";

import { SettingsPageFrame } from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { InviteForm } from "../invite-form";

const NewInvitePage = async () => {
  const { ctx } = await getSettingsViewer();
  if (!ctx) {
    notFound();
  }
  const actor = actorOf(ctx);
  const [open, mailOn] = await Promise.all([
    listOpenInvitations(),
    isMailConfigured(),
  ]);
  return (
    <SettingsPageFrame>
      <InviteForm
        mailOn={mailOn}
        open={open.map((i) => ({
          createdByName: i.createdByName,
          email: i.email,
          expiresAt: i.expiresAt.toISOString(),
          id: i.id,
          role: i.role,
        }))}
        roles={invitableRoles.filter((r) => canInvite(actor, r, true))}
      />
    </SettingsPageFrame>
  );
};

export default NewInvitePage;
