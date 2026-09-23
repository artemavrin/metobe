"use client";

import { Picker } from "../_shared/picker";
import { DeckModels, DoneConfetti, DoneDeal, DoneHello } from "./card-deck";

// P7: first-run onboarding. Chosen: flow "Шаги", card "Колода", riff "Тихая", finish direction "Праздник".
// Now choosing how to celebrate; each variant opens on the finish screen. "Итог" and "Сразу в чат" stay in done.tsx.
const OnboardingPrototypePage = () => (
  <Picker
    variants={[
      { Component: DoneConfetti, name: "Конфетти" },
      { Component: DoneDeal, name: "Раздача" },
      { Component: DoneHello, name: "Привет" },
      { Component: DeckModels, name: "Шаг «Модели»" },
    ]}
  />
);

export default OnboardingPrototypePage;
