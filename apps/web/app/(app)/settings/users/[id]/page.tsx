import {
  canChangeRole,
  canManageAccess,
  canRemove,
} from "@metobe/contracts/members";
import { getMember } from "@metobe/core/users";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SettingsPageFrame } from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { UserDetail } from "../user-detail";

const UserPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const member = z.uuid().safeParse(id).success ? await getMember(id) : null;
  if (!member) {
    notFound();
  }
  const { role, user } = await getSettingsViewer();
  const viewer = role === "superuser" || role === "admin" ? role : "user";
  const you = user?.id === member.id;
  return (
    <SettingsPageFrame>
      <UserDetail
        canChangeRole={!you && canChangeRole(viewer, member.role)}
        canManageAccess={!you && canManageAccess(viewer, member.role)}
        canRemove={!you && canRemove(viewer, member.role)}
        key={member.id}
        member={{
          ...member,
          createdAt: member.createdAt.toISOString(),
          disabledAt: member.disabledAt?.toISOString() ?? null,
          emailVerified: member.emailVerified,
          lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
        }}
        you={you}
      />
    </SettingsPageFrame>
  );
};

export default UserPage;
