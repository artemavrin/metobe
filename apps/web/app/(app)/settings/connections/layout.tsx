import { requireSection } from "@/lib/settings-access";

// Every connections screen is for admins.
const ConnectionsLayout = async ({
  children,
}: {
  children: React.ReactNode;
}) => {
  await requireSection("connections");
  return children;
};

export default ConnectionsLayout;
