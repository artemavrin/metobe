import {
  canChangeRole,
  canManageAccess,
  canRemove,
} from "@metobe/contracts/members";
import { actorOf } from "@metobe/core/context";
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
  const { ctx } = await getSettingsViewer();
  if (!ctx) {
    notFound();
  }
  const actor = actorOf(ctx);
  const you = actor.id === member.id;
  const sameOrg = member.organizationId === ctx.orgId;
  return (
    <SettingsPageFrame>
      <UserDetail
        canChangeRole={!you && canChangeRole(actor, member, sameOrg)}
        canManageAccess={!you && canManageAccess(actor, member, sameOrg)}
        canRemove={!you && canRemove(actor, member, sameOrg)}
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
