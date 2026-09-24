"use client";

import { ShellModes } from "../../app-shell/shell-modes";
import { ProvidersPage } from "./providers-page";
import { ProxiesPage } from "./proxies-page";
import { SourcesPage } from "./sources-page";
import { MOTION_CSS } from "./motion";
import { useSettings } from "./state";

/** D29: «Источники» (who gives access), «Провайдеры» (who made the model) and «Прокси» (§18) as settings sections on one state. */
export const SettingsV3 = ({ start = "settings" }: { start?: "chat" | "settings" } = {}) => {
  const s = useSettings();
  return (
    <>
      <style>{MOTION_CSS}</style>
      <ShellModes pages={{ providers: <SourcesPage s={s} />, proxies: <ProxiesPage s={s} />, vendors: <ProvidersPage s={s} /> }} start={start} />
    </>
  );
};
