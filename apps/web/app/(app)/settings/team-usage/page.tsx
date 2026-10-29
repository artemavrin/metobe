import { notFound } from "next/navigation";

import { UsageScreen } from "@/components/usage/usage-screen";
import type { UsageSearch } from "@/components/usage/usage-screen";
import { getSettingsViewer } from "@/lib/settings-access";

// «Расходы команды»: everyone's runs — models, people, days. The layout turns a non-admin away; the page checks again,
// since a layout and its page render side by side.
const TeamUsagePage = async ({
  searchParams,
}: {
  searchParams: UsageSearch;
}) => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    notFound();
  }
  return <UsageScreen scope="team" searchParams={searchParams} />;
};

export default TeamUsagePage;
