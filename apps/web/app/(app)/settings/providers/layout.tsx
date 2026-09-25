import { requireSection } from "@/lib/settings-access";

// Every providers screen is for admins.
const ProvidersLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("providers");
  return children;
};

export default ProvidersLayout;
