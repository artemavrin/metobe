import { requireSection } from "@/lib/settings-access";

// Every proxies screen is for admins.
const ProxiesLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("proxies");
  return children;
};

export default ProxiesLayout;
