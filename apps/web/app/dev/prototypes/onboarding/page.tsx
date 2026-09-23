"use client";

import { Picker } from "../_shared/picker";
import { DeckModels, DoneBurst, DoneBurstMany, OnboardingFinal } from "./card-deck";

// P7: first-run onboarding — decided. Flow "Шаги", card "Колода" (riff "Тихая"), finish "Праздник · Конфетти · Залп".
// Explored and kept for reference: cards "Шапка"/"Разворот" (card-header.tsx, card-spread.tsx), deck riffs
// «Подписи»/«Тасовка» and finishes «Итог», «Сразу в чат», «Раздача», «Привет», other confetti presets (done.tsx).
const OnboardingPrototypePage = () => (
  <Picker
    variants={[
      { Component: OnboardingFinal, name: "Онбординг" },
      { Component: DeckModels, name: "Шаг «Модели»" },
      { Component: DoneBurst, name: "Финал" },
      { Component: DoneBurstMany, name: "Финал · 40 моделей" },
    ]}
  />
);

export default OnboardingPrototypePage;
