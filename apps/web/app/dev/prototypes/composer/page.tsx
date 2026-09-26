"use client";

import { Picker } from "../_shared/picker";
import { ShellModes } from "../app-shell/shell-modes";
import { ChatScreen } from "./shared";
import { ComposerFinal } from "./x-composer";
import { ComposerClick } from "./y-composer";

// P2 composer + P3 model choice, the chosen direction: favorites + palette picker, skills and connections as
// inline badges (/ and @), files as a tray of cards. Earlier rounds live in this folder (v-*, t3-*) but are off
// the picker, as asked, so they do not get in the way.
const Chosen = () => <ShellModes chatScreen={({ id }) => <ChatScreen Composer={ComposerFinal} id={id} key={id ?? "new"} />} />;
// Round 4 «Щелчок»: favorites on the chip, the palette on ⌘/, micro-interactions everywhere (spec by a design panel).
const Click = () => <ShellModes chatScreen={({ id }) => <ChatScreen Composer={ComposerClick} id={id} key={id ?? "new"} />} />;

const VARIANTS = [
  { Component: Click, name: "Щелчок", pickerTop: true },
  { Component: Chosen, name: "Избранное + палитра", pickerTop: true },
];

const ComposerPrototypePage = () => <Picker variants={VARIANTS} />;

export default ComposerPrototypePage;
