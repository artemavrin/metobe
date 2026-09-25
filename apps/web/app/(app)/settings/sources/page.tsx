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
import { Plus, Server } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// The section's own page: straight to the first source, or an honest empty state with the one thing to do.
const SourcesPage = async () => {
  const [first] = await listSources();
  if (first) {
    redirect(`/settings/sources/${first.id}`);
  }
  const t = await getTranslations("sources");
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Server />
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
