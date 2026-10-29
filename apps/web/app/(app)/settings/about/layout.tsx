import { requireSection } from "@/lib/settings-access";

// The service's version and its updates: admins only.
const AboutLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("about");
  return children;
};

export default AboutLayout;
