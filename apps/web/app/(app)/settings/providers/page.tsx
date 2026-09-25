import { listProviders } from "@metobe/core/providers";
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
import { Factory } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// Straight to the first provider; with no sources yet there are none, and the way on is connecting a source.
const ProvidersPage = async () => {
  const [first] = await listProviders();
  if (first) {
    redirect(`/settings/providers/${first.id}`);
  }
  const [t, ts] = await Promise.all([
    getTranslations("providers"),
    getTranslations("sources"),
  ]);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <Factory />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("empty.title")}</EmptyTitle>
          <EmptyDescription>{t("empty.text")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            nativeButton={false}
            render={<Link href="/settings/sources?connect=1" />}
            variant="outline"
          >
            {ts("add")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
};

export default ProvidersPage;
