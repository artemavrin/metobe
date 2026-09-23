"use client";

import { Picker } from "../_shared/picker";
import { CardDeck } from "./card-deck";
import { CardHeader } from "./card-header";
import { CardSpread } from "./card-spread";

// P7: first-run onboarding. Flow "Шаги" and the card layout are chosen; the variants are cards.
const OnboardingPrototypePage = () => (
  <Picker
    variants={[
      { Component: CardHeader, name: "Шапка" },
      { Component: CardSpread, name: "Разворот" },
      { Component: CardDeck, name: "Колода" },
    ]}
  />
);

export default OnboardingPrototypePage;
