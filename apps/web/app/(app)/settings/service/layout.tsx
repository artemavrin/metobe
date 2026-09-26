import { requireSection } from "@/lib/settings-access";

// Service models are the service's settings: admins only.
const ServiceLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("service");
  return children;
};

export default ServiceLayout;
