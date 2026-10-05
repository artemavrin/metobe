import { requireSection } from "@/lib/settings-access";

// How much people may ask is the service's settings: admins only.
const LimitsLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("limits");
  return children;
};

export default LimitsLayout;
