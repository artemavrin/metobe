import { listCatalog } from "@metobe/core/catalog";
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
import { Plug, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// Straight to the first server; none — adding one is the only thing to do (ARCH §0.2).
const ConnectionsPage = async () => {
  const [first] = await listCatalog();
  if (first) {
    redirect(`/settings/connections/${first.id}`);
  }
  const t = await getTranslations("connections");
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
          <EmptyDescription>{t("empty.text")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            nativeButton={false}
            render={<Link href="/settings/connections/new" />}
            variant="outline"
          >
            <Plus /> {t("add")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
};

export default ConnectionsPage;
