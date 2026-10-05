import { requireSection } from "@/lib/settings-access";

// Who may sign in is the service's settings: admins only.
const AccessLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("access");
  return children;
};

export default AccessLayout;
