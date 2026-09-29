"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { InlineMenu } from "./v-inline";
import { CardMenu } from "./v-card";
import { PaletteMenu } from "./v-palette";
import { RowsMenu } from "./v-rows";
import { ProtoParams, ProtoProvider } from "./state";
import { Stage } from "./stage";

// P10 · «Меню аккаунта»: что открывается из строки с аватаром внизу боковой панели чата. Четыре разных устройства
// одного и того же набора — тема, язык, переходы в аккаунт, настройки, выход: список с подменю, всё в одной строке,
// палитра с поиском, карточка с плитками. Тема переключается по-настоящему, остальное — только здесь.
// «Параметры»: экран (компьютер или телефон) и боковая панель (развёрнута или свёрнута до аватара).

/** Только в браузере: тема известна там. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const of = (Menu: typeof RowsMenu) => () => (
  <Mounted>
    <Stage footer={(p) => <Menu {...p} />} />
  </Mounted>
);

const AccountMenuPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: of(RowsMenu), name: "Строки" },
        { Component: of(InlineMenu), name: "В одну строку" },
        { Component: of(PaletteMenu), name: "Палитра" },
        { Component: of(CardMenu), name: "Карточка" },
      ]}
    />
  </ProtoProvider>
);

export default AccountMenuPrototypePage;
