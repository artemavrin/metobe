"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@metobe/ui/components/tabs";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { Section } from "@/components/settings/rows";
import { SettingsPageFrame } from "@/components/settings/settings-shell";

import {
  DangerRows,
  DevicesRows,
  ENTER,
  ExportRows,
  Header,
  LookBody,
  ModelBody,
  RegionRows,
  RevokeOthers,
} from "./parts";

// «Вкладки»: the header stays, and under it three tabs — who you are and where you are signed in, how it looks and
// what the model knows, your data. One thing at a time; the page never gets long.

/**
 * The picker flips variants with the arrow keys, on the document; the tabs keep theirs to themselves. A native
 * listener on the way up, after the tabs have taken the key and before the document sees it.
 */
const OwnKeys = ({ children }: { children: ReactNode }) => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const stop = (e: KeyboardEvent) => e.stopPropagation();
    el?.addEventListener("keydown", stop);
    return () => el?.removeEventListener("keydown", stop);
  }, []);
  return <div ref={box}>{children}</div>;
};

export const Tabbed = () => (
  <SettingsPageFrame>
    <Header />
    <Tabs defaultValue="profile">
      <OwnKeys>
        <TabsList>
          <TabsTrigger value="profile">Профиль</TabsTrigger>
          <TabsTrigger value="personal">Персонализация</TabsTrigger>
          <TabsTrigger value="data">Данные</TabsTrigger>
        </TabsList>
      </OwnKeys>
      <TabsContent
        className={`mt-6 flex flex-col gap-8 ${ENTER}`}
        value="profile"
      >
        <Section action={<RevokeOthers />} title="Активные сеансы">
          <DevicesRows />
        </Section>
      </TabsContent>
      <TabsContent
        className={`mt-6 flex flex-col gap-8 ${ENTER}`}
        value="personal"
      >
        <Section title="Внешний вид">
          <LookBody />
        </Section>
        <Section title="Язык и регион">
          <RegionRows />
        </Section>
        <Section title="Сведения для модели">
          <ModelBody />
        </Section>
      </TabsContent>
      <TabsContent className={`mt-6 flex flex-col gap-8 ${ENTER}`} value="data">
        <Section title="Ваши данные">
          <ExportRows />
        </Section>
        <Section title="Опасная зона">
          <DangerRows />
        </Section>
      </TabsContent>
    </Tabs>
  </SettingsPageFrame>
);
