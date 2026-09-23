"use client";

import { Picker } from "../_shared/picker";
import { DoneBurst, DoneBurstMany, DonePoppers, DoneRain } from "./card-deck";

// P7: first-run onboarding. Chosen: flow "Шаги", card "Колода", riff "Тихая", finish "Праздник · Конфетти".
// Now tuning the confetti. «Раздача», «Привет», «Итог», «Сразу в чат» stay in done.tsx; the models step is DeckModels.
const OnboardingPrototypePage = () => (
  <Picker
    variants={[
      { Component: DoneBurst, name: "Залп" },
      { Component: DoneRain, name: "Дождь" },
      { Component: DonePoppers, name: "Хлопушки" },
      { Component: DoneBurstMany, name: "Залп · 40 моделей" },
    ]}
  />
);

export default OnboardingPrototypePage;
