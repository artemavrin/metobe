"use client";

import { Section } from "@/components/settings/rows";
import { SettingsPageFrame } from "@/components/settings/settings-shell";

import {
  DangerRows,
  DevicesRows,
  ExportRows,
  Header,
  LookBody,
  ModelBody,
  RegionRows,
  RevokeOthers,
} from "./parts";

// «Сплошная»: the same account with no rail at all — the header, then the sections one under another, in the order
// of use: how it looks, what the model is told, where the account is signed in, the data. Nothing to click to move
// on and nothing to keep in step with the scroll; the cost is that the page has to be scrolled to be known.

export const Flat = () => (
  <SettingsPageFrame>
    <Header />
    <Section title="Внешний вид">
      <LookBody />
    </Section>
    <Section title="Язык и регион">
      <RegionRows />
    </Section>
    <Section title="Сведения для модели">
      <ModelBody />
    </Section>
    <Section action={<RevokeOthers />} title="Активные сеансы">
      <DevicesRows />
    </Section>
    <Section title="Данные">
      <ExportRows />
    </Section>
    <Section title="Опасная зона">
      <DangerRows />
    </Section>
  </SettingsPageFrame>
);
