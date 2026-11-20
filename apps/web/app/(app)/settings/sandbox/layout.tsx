import { requireSection } from "@/lib/settings-access";

// The sandbox is the service's settings: admins only.
const SandboxLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("sandbox");
  return children;
};

export default SandboxLayout;
