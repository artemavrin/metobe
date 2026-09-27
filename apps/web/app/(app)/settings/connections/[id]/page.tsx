import { getCatalogItem, myCredential } from "@metobe/core/catalog";
import { listMyConnections } from "@metobe/core/mcp";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SettingsPageFrame } from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";

import { MyServerPage } from "../my-server";

// One server of «Подключения»: only one the user may use; their own credentials read here, never someone else's.
const ServerPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const [{ id }, { user }] = await Promise.all([params, getSettingsViewer()]);
  if (!(user && z.uuid().safeParse(id).success)) {
    notFound();
  }
  const servers = await listMyConnections(user.id);
  const server = servers.find((s) => s.id === id);
  const item = server ? await getCatalogItem(id) : null;
  if (!(server && item)) {
    notFound();
  }
  const credential = server.connection
    ? await myCredential(item, user.id)
    : { hint: null, login: null };
  return (
    <SettingsPageFrame>
      <MyServerPage credential={credential} key={server.id} server={server} />
    </SettingsPageFrame>
  );
};

export default ServerPage;
