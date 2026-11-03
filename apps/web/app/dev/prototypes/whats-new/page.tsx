"use client";

import { MousePointerClick } from "lucide-react";
import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { AutoDemo, Live } from "./autoplay";
import { SKETCHES } from "./sketches";
import { ProtoParams, ProtoProvider } from "./state";
import { TourShell } from "./tour-shell";

// «Что нового», round 2 — the «Тур» from round 1 (now at /whats-new/round-1), without screenshots. What stands where
// the picture was: «Потрогать» — the product's own parts, live, to press; «Смотреть» — the same parts played by a
// cursor, a click takes over; «Рисунок» — a drawing of the idea in the theme's blocks, looping.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const TRY: Record<string, string> = {
  ask: "Попробуйте: выберите вариант цифрой или мышью, напишите свой или нажмите Esc",
  map: "Попробуйте: наведите на полоски слева и щёлкните",
  share: "Попробуйте: «Поделиться» в шапке, потом переключатель. Название чата меняется щелчком",
  welcome: "Звёзды падают прямо на поле ввода",
};

const Hint = ({ icon: Icon, children }: { icon: typeof MousePointerClick; children: React.ReactNode }) => (
  <p className="text-muted-foreground/80 mt-1 flex items-start gap-1.5 text-xs">
    <Icon className="mt-px size-3.5 shrink-0" />
    {children}
  </p>
);

const Touch = () => (
  <TourShell
    hint={(c) => TRY[c.id] && <Hint icon={MousePointerClick}>{TRY[c.id]}</Hint>}
    intro="Всё на картинках — настоящее: нажимайте."
    media={(c) => <Live id={c.id} />}
  />
);

const Watch = () => (
  <TourShell
    intro="Курсор покажет, как всё работает, а щелчок по картинке даст попробовать самому."
    media={(c, active) => (c.id === "welcome" ? <Live id={c.id} /> : <AutoDemo active={active} id={c.id} />)}
  />
);

const Drawing = () => (
  <TourShell
    media={(c) => {
      const Sketch = SKETCHES[c.id];
      return Sketch ? <Sketch /> : null;
    }}
  />
);

const WhatsNewPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Touch /></Mounted>, name: "Потрогать", pickerTop: true },
        { Component: () => <Mounted><Watch /></Mounted>, name: "Смотреть", pickerTop: true },
        { Component: () => <Mounted><Drawing /></Mounted>, name: "Рисунок", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default WhatsNewPrototypePage;
