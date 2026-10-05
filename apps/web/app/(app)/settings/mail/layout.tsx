import { requireSection } from "@/lib/settings-access";

// The service's mail is the service's settings: admins only.
const MailLayout = async ({ children }: { children: React.ReactNode }) => {
  await requireSection("mail");
  return children;
};

export default MailLayout;
