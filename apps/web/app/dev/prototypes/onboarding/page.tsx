"use client";

import { Picker } from "../_shared/picker";
import { DoneBurst, DoneBurstMany, DoneCannons, DoneFireworks, DoneStars } from "./card-deck";

// P7: first-run onboarding. Chosen: flow "Шаги", card "Колода", riff "Тихая", finish "Праздник · Конфетти".
// Confetti is Magic UI Confetti (canvas-confetti); the variants are its presets aimed at the card.
// «Раздача», «Привет», «Итог», «Сразу в чат» stay in done.tsx; the models step is DeckModels.
const OnboardingPrototypePage = () => (
  <Picker
    variants={[
      { Component: DoneBurst, name: "Залп" },
      { Component: DoneCannons, name: "Пушки" },
      { Component: DoneFireworks, name: "Фейерверк" },
      { Component: DoneStars, name: "Звёзды" },
      { Component: DoneBurstMany, name: "Залп · 40 моделей" },
    ]}
  />
);

export default OnboardingPrototypePage;
