import { listSources } from "@metobe/core/sources-read";
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
import { Plus, Server } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// The section's own page: straight to the first source, or an honest empty state with the one thing to do.
const SourcesPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const [[first], { connect }] = await Promise.all([
    listSources(),
    searchParams,
  ]);
  if (first) {
    // The connect dialog opens over the first source, not lost in the redirect.
    redirect(
      `/settings/sources/${first.id}${connect === "1" ? "?connect=1" : ""}`
    );
  }
  const t = await getTranslations("sources");
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <Server />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("empty.title")}</EmptyTitle>
          <EmptyDescription>{t("empty.text")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            nativeButton={false}
            render={<Link href="/settings/sources?connect=1" />}
          >
            <Plus /> {t("add")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
};

export default SourcesPage;
