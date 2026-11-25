"use client";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider } from "../memory/frame";
import { TariffsStateProvider } from "./state";
import { CardsVariant } from "./v-cards";
import { CompareVariant } from "./v-compare";
import { PageVariant } from "./v-page";

// P38 · тарифы и прогноз у суперюзера (ORGS-PLAN §5.2, §10, О7 и О13): редактор тарифа — цена, валюта, НДС, лимиты
// на 5 часов и неделю, модели с «×N» и ответами в неделю, модель по умолчанию, возможности; прогноз на следующий
// месяц и «покрутить» без сохранения до «Применить к тарифу». Три варианта: «Страница», «Сравнение», «Карточки».
// В адресе: `?v=1..3`, экран `scr=tariff|forecast`, тариф `t=basic|pro|max`, телефон — `sz=phone`.
// Все цены, лимиты и расходы — выдуманные числа прототипа.

const PlatformTariffsPage = () => (
  <ProtoProvider defaults={{ scr: "tariff", t: "pro" }}>
    <TariffsStateProvider>
      <Picker
        params={
          <Params
            rows={[
              ["scr", "экран", [["tariff", "тарифы"], ["forecast", "прогноз"]]],
              ["t", "тариф", [["basic", "Обычный"], ["pro", "Про"], ["max", "Макс"]]],
            ]}
          />
        }
        variants={[
          { Component: PageVariant, name: "Страница" },
          { Component: CompareVariant, name: "Сравнение" },
          { Component: CardsVariant, name: "Карточки" },
        ]}
      />
    </TariffsStateProvider>
  </ProtoProvider>
);

export default PlatformTariffsPage;
