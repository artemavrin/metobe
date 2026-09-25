import { getProxy } from "@metobe/core/proxies";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SettingsPageFrame } from "@/components/settings/settings-shell";

import { ProxyDetail } from "../proxy-detail";

const ProxyPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const detail = z.uuid().safeParse(id).success ? await getProxy(id) : null;
  if (!detail) {
    notFound();
  }
  return (
    <SettingsPageFrame>
      <ProxyDetail detail={detail} key={detail.proxy.id} />
    </SettingsPageFrame>
  );
};

export default ProxyPage;
