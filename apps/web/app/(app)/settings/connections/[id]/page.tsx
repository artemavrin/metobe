import {
  catalogSecretHint,
  getCatalogItem,
  listCatalogAccess,
} from "@metobe/core/catalog";
import { listUsers } from "@metobe/core/users";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SettingsPageFrame } from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { ServerDetail } from "../server-detail";

const ServerPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ oauth?: string }>;
}) => {
  const [{ id }, { oauth }, { user }] = await Promise.all([
    params,
    searchParams,
    getSettingsViewer(),
  ]);
  const item = z.uuid().safeParse(id).success ? await getCatalogItem(id) : null;
  if (!item || !user) {
    notFound();
  }
  const [hint, picked, users] = await Promise.all([
    catalogSecretHint(item, user.id),
    listCatalogAccess(item.id),
    listUsers(),
  ]);
  return (
    <SettingsPageFrame>
      <ServerDetail
        hint={hint}
        item={item}
        key={item.id}
        oauthFailed={oauth === "failed"}
        picked={picked}
        users={users}
      />
    </SettingsPageFrame>
  );
};

export default ServerPage;
