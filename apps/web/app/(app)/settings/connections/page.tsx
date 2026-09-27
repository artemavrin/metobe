import { listMyConnections } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metobe/ui/components/empty";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { Plug } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSettingsViewer } from "@/lib/settings-access";

// «Подключения»: straight to the first server — the user's own ones come first — or an honest empty state; an admin
// is led to the catalog, where servers are added.
const ConnectionsPage = async () => {
  const { admin, user } = await getSettingsViewer();
  if (!user) {
    notFound();
  }
  const servers = await listMyConnections(user.id);
  const first = servers.find((s) => s.mode === "per_user") ?? servers[0];
  if (first) {
    redirect(`/settings/connections/${first.id}`);
  }
  const t = await getTranslations("myConnections");
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <Plug />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("empty.title")}</EmptyTitle>
          <EmptyDescription>
            {admin ? t("empty.textAdmin") : t("empty.text")}
          </EmptyDescription>
        </EmptyHeader>
        {admin && (
          <EmptyContent>
            <Button
              nativeButton={false}
              render={<Link href="/settings/mcp" />}
              variant="outline"
            >
              {t("empty.catalog")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    </div>
  );
};

export default ConnectionsPage;
