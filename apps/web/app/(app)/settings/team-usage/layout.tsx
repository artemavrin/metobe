import { requireSection } from "@/lib/settings-access";

// What everyone spends is the service's: admins only.
const TeamUsageLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("team-usage");
  return children;
};

export default TeamUsageLayout;
