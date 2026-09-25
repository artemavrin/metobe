import { listProxies } from "@metobe/core/proxies";
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
import { Network, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// Straight to the first proxy; none — everything goes direct, and adding one is the only thing to do.
const ProxiesPage = async () => {
  const [first] = await listProxies();
  if (first) {
    redirect(`/settings/proxies/${first.id}`);
  }
  const t = await getTranslations("proxies");
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <Network />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("empty.title")}</EmptyTitle>
          <EmptyDescription>{t("empty.text")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            nativeButton={false}
            render={<Link href="/settings/proxies/new" />}
            variant="outline"
          >
            <Plus /> {t("add")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
};

export default ProxiesPage;
