import { requireSection } from "@/lib/settings-access";

// Every users screen is for admins.
const UsersLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("users");
  return children;
};

export default UsersLayout;
