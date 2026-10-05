import { requireSection } from "@/lib/settings-access";

// The files' storage is the service's settings: admins only.
const StorageLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("storage");
  return children;
};

export default StorageLayout;
