"use client";

import type { ComponentProps } from "react";

import { ChatShell } from "@/components/chat/chat-shell";

import { Picker } from "../_shared/picker";
import type { Variant } from "../_shared/picker";
import { DataProvider } from "./engine";
import type { Data } from "./engine";
import { AsIs, BackdropParams, KnobsProvider } from "./backdrop";
import { DaylightVariant } from "./bg-daylight";
import { Grid } from "./bg-grid";
import { LinksVariant } from "./bg-links";
import { BounceVariant, Falling, Rare, TowardQuestion, Window } from "./bg-stars";
import { Ambient } from "./v-ambient";
import { Anchored } from "./v-anchored";
import { SourcesVariant } from "./v-sources";
import { Split } from "./v-split";
import { Stage } from "./v-stage";
import { First, Left, Plain, Side, Top } from "./welcome";

type Shell = ComponentProps<typeof ChatShell>;

type Round = 1 | 2 | 3 | 4;

const ROUNDS: Record<Round, Variant[]> = {
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
  3: [
    { Component: AsIs, name: "Как сейчас", pickerTop: true },
    { Component: Grid, name: "Сетка", pickerTop: true },
    { Component: DaylightVariant, name: "Свет дня", pickerTop: true },
    { Component: LinksVariant, name: "Связи", pickerTop: true },
  ],
  4: [
    { Component: AsIs, name: "Как сейчас", pickerTop: true },
    { Component: Falling, name: "Звездопад", pickerTop: true },
    { Component: Rare, name: "Редкие", pickerTop: true },
    { Component: Window, name: "Окно", pickerTop: true },
    { Component: TowardQuestion, name: "К вопросу", pickerTop: true },
    { Component: BounceVariant, name: "Отскок", pickerTop: true },
  ],
};

/** The chat's own shell around every variant: the sidebar with the user's chats, the header, the screen. */
export const Prototype = ({
  chats,
  user,
  sendKey,
  round,
  ...data
}: Data & Pick<Shell, "chats" | "user" | "sendKey"> & { round: Round }) => (
  <DataProvider value={data}>
    <KnobsProvider>
      <ChatShell admin={false} chats={chats} sendKey={sendKey} user={user}>
        <Picker params={round >= 3 ? <BackdropParams eggs={round === 4} /> : undefined} variants={ROUNDS[round]} />
      </ChatShell>
    </KnobsProvider>
  </DataProvider>
);
