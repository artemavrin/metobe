import { requireSection } from "@/lib/settings-access";

// The web search is the service's settings: admins only.
const SearchLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("search");
  return children;
};

export default SearchLayout;
