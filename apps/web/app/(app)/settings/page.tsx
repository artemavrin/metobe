import { redirect } from "next/navigation";

// The first screen of settings; admins will land on sources once that screen exists (M2 step 6b).
const SettingsIndex = () => redirect("/settings/appearance");

export default SettingsIndex;
