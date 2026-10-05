"use client";

import { invitableRoles } from "@metobe/contracts/members";
import type { Role } from "@metobe/contracts/members";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metobe/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Row, Rows, Section } from "@/components/settings/rows";

import { changeRole, removeUser } from "./actions";
import { AccessSection } from "./user-access";

// One person (P7 list and detail): who they are, their role (the owner changes it), when they joined and were last
// seen, and removal with its consequences said before it is done.

interface Props {
  member: {
    id: string;
    name: string;
    email: string;
    role: Role;
    createdAt: string;
    /** When the account was turned off; null — it works. */
    disabledAt: string | null;
    emailVerified: boolean;
    lastSeenAt: string | null;
  };
  you: boolean;
  canChangeRole: boolean;
  /** Turning the account off and handing it a sign-in link: the rule for removing. */
  canManageAccess: boolean;
  canRemove: boolean;
}

export const UserDetail = ({
  member,
  you,
  canChangeRole: mayRole,
  canManageAccess: mayManage,
  canRemove: mayRemove,
}: Props) => {
  const t = useTranslations("users");
  const f = useFormatter();
  const router = useRouter();
  const [role, setRole] = useState(member.role);
  const [removing, startRemove] = useTransition();
  const [changing, startChange] = useTransition();
  return (
    <>
      <header className="flex items-center gap-3">
        <BrandLogo label={member.name} logo={undefined} size={40} />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {member.name}
            {you && (
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {t("detail.you")}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground truncate">{member.email}</p>
        </div>
      </header>

      <Section title={t("detail.role")}>
        <Rows>
          <Row
            hint={mayRole ? t(`roleHints.${role}`) : t("detail.roleOnlyOwner")}
            label={t(`roles.${role}`)}
          >
            {mayRole && (
              <Select
                disabled={changing}
                onValueChange={(next) => {
                  if (!next || next === role) {
                    return;
                  }
                  const was = role;
                  setRole(next as Role);
                  startChange(async () => {
                    const done = await changeRole(member.id, next);
                    if (!done) {
                      setRole(was);
                    }
                    router.refresh();
                  });
                }}
                value={role}
              >
                <SelectTrigger className="w-48">
                  <SelectValue>{t(`roles.${role}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {invitableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`roles.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Row>
          <Row label={t("detail.joined")}>
            <span className="text-muted-foreground">
              {f.dateTime(new Date(member.createdAt), { dateStyle: "long" })}
            </span>
          </Row>
          <Row label={t("detail.lastSeen")}>
            <span className="text-muted-foreground">
              {member.lastSeenAt
                ? f.dateTime(new Date(member.lastSeenAt), {
                    dateStyle: "long",
                    timeStyle: "short",
                  })
                : t("detail.never")}
            </span>
          </Row>
        </Rows>
      </Section>

      {mayManage && <AccessSection member={member} />}

      <Section title={t("detail.remove.section")}>
        <Rows>
          <Row
            action={
              mayRemove ? (
                <Dialog>
                  <DialogTrigger
                    render={<Button size="sm" variant="destructive" />}
                  >
                    {t("detail.remove.action")}
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>
                        {t("detail.remove.confirm", { name: member.name })}
                      </DialogTitle>
                      <DialogDescription>
                        {t("detail.remove.text")}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>
                        {t("detail.remove.cancel")}
                      </DialogClose>
                      <Button
                        disabled={removing}
                        onClick={() =>
                          startRemove(async () => {
                            await removeUser(member.id);
                            router.replace("/settings/users");
                          })
                        }
                        variant="destructive"
                      >
                        {removing && <Spinner />}
                        {t("detail.remove.action")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : undefined
            }
            hint={
              mayRemove ? t("detail.remove.hint") : t("detail.remove.cannot")
            }
            label={t("detail.remove.label")}
          />
        </Rows>
      </Section>
    </>
  );
};
