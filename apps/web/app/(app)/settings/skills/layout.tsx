import { requireSection } from "@/lib/settings-access";

// The organization's skills are the service's settings: admins only.
const SkillsLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("skills");
  return children;
};

export default SkillsLayout;
