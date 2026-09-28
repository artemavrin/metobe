import { listMailboxes } from "@metobe/core/mailboxes";
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
  const [servers, boxes] = await Promise.all([
    listMyConnections(user.id),
    listMailboxes(user.id),
  ]);
  const first = servers.find((s) => s.mode === "per_user") ?? servers[0];
  if (first) {
    redirect(`/settings/connections/${first.id}`);
  }
  if (boxes[0]) {
    redirect(`/settings/connections/mail/${boxes[0].id}`);
  }
  const [t, tm] = await Promise.all([
    getTranslations("myConnections"),
    getTranslations("mail.list"),
  ]);
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
        <EmptyContent className="flex-row justify-center">
          <Button
            nativeButton={false}
            render={<Link href="/settings/connections/mail/new" />}
          >
            {tm("add")}
          </Button>
          {admin && (
            <Button
              nativeButton={false}
              render={<Link href="/settings/mcp" />}
              variant="outline"
            >
              {t("empty.catalog")}
            </Button>
          )}
        </EmptyContent>
      </Empty>
    </div>
  );
};

export default ConnectionsPage;
