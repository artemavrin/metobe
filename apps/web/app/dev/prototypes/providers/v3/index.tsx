"use client";

import { ShellModes } from "../../app-shell/shell-modes";
import { LayoutDrill } from "./layouts";
import { MOTION_CSS } from "./motion";
import { useSettings } from "./state";

/** The chosen settings (P7): «Погружение» — the sidebar drills into a section's list; a full-screen stack on phones. */
export const SettingsV3 = ({ start = "settings" }: { start?: "chat" | "settings" } = {}) => {
  const s = useSettings();
  return (
    <>
      <style>{MOTION_CSS}</style>
      <ShellModes settings={(ctx) => <LayoutDrill ctx={ctx} s={s} />} start={start} />
    </>
  );
};
