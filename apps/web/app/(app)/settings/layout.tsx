import { SettingsLayoutBody } from "@/lib/settings-layout";

// Settings opened by their address (a link, a refresh): the settings window over an empty page. From inside the app
// they open over what the person was doing — see app/(app)/@modal.
const SettingsLayout = ({ children }: { children: React.ReactNode }) => (
  <SettingsLayoutBody>{children}</SettingsLayoutBody>
);

export default SettingsLayout;
