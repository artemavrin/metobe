import { UsageScreen } from "@/components/usage/usage-screen";
import type { UsageSearch } from "@/components/usage/usage-screen";
import { getSettingsViewer } from "@/lib/settings-access";

// «Расходы»: what the viewer spent — models, days, what it went on. Their own runs only.
const UsagePage = async ({ searchParams }: { searchParams: UsageSearch }) => {
  const { user } = await getSettingsViewer();
  return (
    <UsageScreen
      scope="me"
      searchParams={searchParams}
      // No session reaches no settings page; an empty id finds no runs rather than everyone's.
      userId={user?.id ?? ""}
    />
  );
};

export default UsagePage;
