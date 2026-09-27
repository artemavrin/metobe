import { requireSection } from "@/lib/settings-access";

// Every screen of the MCP catalog is for admins.
const McpLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("mcp");
  return children;
};

export default McpLayout;
