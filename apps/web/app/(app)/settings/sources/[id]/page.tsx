import { getSource } from "@metobe/core/sources-read";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SettingsPageFrame } from "@/components/settings/settings-shell";

import { SourceDetail } from "../source-detail";

const SourcePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const detail = z.uuid().safeParse(id).success ? await getSource(id) : null;
  if (!detail) {
    notFound();
  }
  return (
    <SettingsPageFrame>
      <SourceDetail detail={detail} key={detail.source.id} />
    </SettingsPageFrame>
  );
};

export default SourcePage;
