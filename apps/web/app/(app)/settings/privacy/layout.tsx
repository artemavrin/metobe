import { requireSection } from "@/lib/settings-access";

// Data protection is the service's settings: admins only.
const PrivacyLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("privacy");
  return children;
};

export default PrivacyLayout;
