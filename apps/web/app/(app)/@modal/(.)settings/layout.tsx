import { SettingsLayoutBody } from "@/lib/settings-layout";

// Settings opened from inside the app (soft navigation): the same window, over the page the person was on.
// Every screen of settings has its mirror here (a re-export): `lib/settings-modal.test.ts` keeps them together.
const SettingsModalLayout = ({ children }: { children: React.ReactNode }) => (
  <SettingsLayoutBody intercepted>{children}</SettingsLayoutBody>
);

export default SettingsModalLayout;
