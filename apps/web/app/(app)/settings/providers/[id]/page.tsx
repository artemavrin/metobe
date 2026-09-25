import { getProvider } from "@metobe/core/providers";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SettingsPageFrame } from "@/components/settings/settings-shell";

import { ProviderDetail } from "../provider-detail";

const ProviderPage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = await params;
  const detail = z.uuid().safeParse(id).success ? await getProvider(id) : null;
  if (!detail) {
    notFound();
  }
  return (
    <SettingsPageFrame>
      <ProviderDetail detail={detail} key={detail.provider.id} />
    </SettingsPageFrame>
  );
};

export default ProviderPage;
