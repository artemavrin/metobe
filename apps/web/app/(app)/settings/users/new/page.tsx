import { canInvite, invitableRoles } from "@metobe/contracts/members";
import { listOpenInvitations } from "@metobe/core/invitations";

import { SettingsPageFrame } from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { InviteForm } from "../invite-form";

const NewInvitePage = async () => {
  const { role } = await getSettingsViewer();
  const viewer = role === "superuser" || role === "admin" ? role : "user";
  const open = await listOpenInvitations();
  return (
    <SettingsPageFrame>
      <InviteForm
        open={open.map((i) => ({
          createdByName: i.createdByName,
          email: i.email,
          expiresAt: i.expiresAt.toISOString(),
          id: i.id,
          role: i.role,
        }))}
        roles={invitableRoles.filter((r) => canInvite(viewer, r))}
      />
    </SettingsPageFrame>
  );
};

export default NewInvitePage;
