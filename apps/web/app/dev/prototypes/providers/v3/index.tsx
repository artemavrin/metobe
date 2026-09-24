"use client";

import { ShellModes } from "../../app-shell/shell-modes";
import { ProvidersPage } from "./providers-page";
import { ProxiesPage } from "./proxies-page";
import { SourcesPage } from "./sources-page";
import { useSettings } from "./state";

/** D29: «Источники» (who gives access), «Провайдеры» (who made the model) and «Прокси» (§18) as settings sections on one state. */
export const SettingsV3 = () => {
  const s = useSettings();
  return <ShellModes pages={{ providers: <SourcesPage s={s} />, proxies: <ProxiesPage s={s} />, vendors: <ProvidersPage s={s} /> }} start="settings" />;
};
