"use client";

import type { ComponentProps } from "react";

import { ChatShell } from "@/components/chat/chat-shell";

import { Picker } from "../_shared/picker";
import type { Variant } from "../_shared/picker";
import { DataProvider } from "./engine";
import type { Data } from "./engine";
import { Ambient } from "./v-ambient";
import { Anchored } from "./v-anchored";
import { SourcesVariant } from "./v-sources";
import { Split } from "./v-split";
import { Stage } from "./v-stage";
import { First, Left, Plain, Side, Top } from "./welcome";

type Shell = ComponentProps<typeof ChatShell>;

const ROUNDS: Record<1 | 2, Variant[]> = {
  1: [
    { Component: Stage, name: "Сцена" },
    { Component: Split, name: "Рядом" },
    { Component: Anchored, name: "Внизу", pickerTop: true },
    { Component: Ambient, name: "Фон" },
    { Component: SourcesVariant, name: "Источники" },
  ],
  2: [
    { Component: Top, name: "Сверху", pickerTop: true },
    { Component: Side, name: "Сбоку", pickerTop: true },
    { Component: Plain, name: "Без картинки", pickerTop: true },
    { Component: Left, name: "Слева", pickerTop: true },
    { Component: First, name: "Первый раз", pickerTop: true },
  ],
};

/** The chat's own shell around every variant: the sidebar with the user's chats, the header, the screen. */
export const Prototype = ({
  chats,
  user,
  sendKey,
  round,
  ...data
}: Data & Pick<Shell, "chats" | "user" | "sendKey"> & { round: 1 | 2 }) => (
  <DataProvider value={data}>
    <ChatShell chats={chats} sendKey={sendKey} user={user}>
      <Picker variants={ROUNDS[round]} />
    </ChatShell>
  </DataProvider>
);
