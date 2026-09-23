"use client";

import { Picker } from "../_shared/picker";
import { DeckLabels, DeckQuiet, DeckShuffle } from "./card-deck";

// P7: first-run onboarding. Flow "Шаги" and the "Колода" card are chosen; the variants riff on the deck.
// The earlier cards "Шапка" and "Разворот" stay in card-header.tsx and card-spread.tsx for reference.
const OnboardingPrototypePage = () => (
  <Picker
    variants={[
      { Component: DeckQuiet, name: "Тихая" },
      { Component: DeckLabels, name: "Подписи" },
      { Component: DeckShuffle, name: "Тасовка" },
    ]}
  />
);

export default OnboardingPrototypePage;
