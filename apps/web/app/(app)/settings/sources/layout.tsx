import { listSources } from "@metobe/core/sources-read";

import { requireSection } from "@/lib/settings-access";

import { ConnectDialog } from "./connect-dialog";

// Every sources screen is for admins; the connect dialog opens over any of them with `?connect=1`.
const SourcesLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("sources");
  const sources = await listSources();
  const connected = [...new Set(sources.map((s) => s.kind))];
  return (
    <>
      {children}
      <ConnectDialog connectedKinds={connected} />
    </>
  );
};

export default SourcesLayout;
