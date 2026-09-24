import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metobe/ui/components/empty";
import { getTranslations } from "next-intl/server";

import { requireSection } from "@/lib/settings-access";
import { findSection } from "@/lib/settings-nav";
import type { SettingsSectionId } from "@/lib/settings-nav";

// Sections of later stages: a known id gets an honest «in the works», anything else a 404.
const SectionPlaceholder = async ({
  params,
}: {
  params: Promise<{ section: string }>;
}) => {
  const { section } = await params;
  await requireSection(section);
  const item = findSection(section);
  const t = await getTranslations("settings");
  const Icon = item?.icon;
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{Icon && <Icon />}</EmptyMedia>
          <EmptyTitle>
            {t(`sections.${section as SettingsSectionId}.label`)}
          </EmptyTitle>
          <EmptyDescription>
            {t(`sections.${section as SettingsSectionId}.hint`)}.{" "}
            {t("wip.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
};

export default SectionPlaceholder;
