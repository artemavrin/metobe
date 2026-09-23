"use client";

import { Picker } from "../_shared/picker";
import { LayoutCard } from "./layout-card";
import { LayoutFeed } from "./layout-feed";
import { LayoutSplit } from "./layout-split";

// P7: first-run onboarding. The flow ("Шаги") is chosen; the variants are layouts.
const OnboardingPrototypePage = () => (
  <Picker
    variants={[
      { Component: LayoutCard, name: "Карточка" },
      { Component: LayoutSplit, name: "Сплит" },
      { Component: LayoutFeed, name: "Лента" },
    ]}
  />
);

export default OnboardingPrototypePage;
