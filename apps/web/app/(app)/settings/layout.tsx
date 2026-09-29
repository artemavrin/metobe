import { getTranslations } from "next-intl/server";

import { SettingsShell } from "@/components/settings/settings-shell";
import { UserAvatar } from "@/components/user-avatar";
import { getSettingsViewer } from "@/lib/settings-access";
import { getSettingsLists } from "@/lib/settings-lists";

const SettingsLayout = async ({ children }: { children: React.ReactNode }) => {
  const [{ admin, role, user }, t] = await Promise.all([
    getSettingsViewer(),
    getTranslations("settings.roles"),
  ]);
  const lists = await getSettingsLists(admin, user?.id);
  const name = user?.name || user?.email || "";
  const roleKey = role === "superuser" || role === "admin" ? role : "user";
  return (
    <SettingsShell
      account={
        <div className="flex items-center gap-2.5 px-1 py-1">
          <UserAvatar image={user?.image} name={name} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {t(roleKey)}
            </span>
          </span>
        </div>
      }
      admin={admin}
      lists={lists}
    >
      {children}
    </SettingsShell>
  );
};

export default SettingsLayout;
