import { getTranslations } from "next-intl/server";

import { SettingsShell } from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";
import { getSettingsLists } from "@/lib/settings-lists";

const initials = (name: string) =>
  name
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const SettingsLayout = async ({ children }: { children: React.ReactNode }) => {
  const [{ admin, role, user }, t] = await Promise.all([
    getSettingsViewer(),
    getTranslations("settings.roles"),
  ]);
  const lists = await getSettingsLists(admin);
  const name = user?.name || user?.email || "";
  const roleKey = role === "superuser" || role === "admin" ? role : "user";
  return (
    <SettingsShell
      account={
        <div className="flex items-center gap-2.5 px-1 py-1">
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {initials(name)}
          </span>
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
