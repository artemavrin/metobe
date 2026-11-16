"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import { Balance, Column } from "./variants";

// P22 · раунд 2: карточка человека на странице «Память». Раунд 1 — ./round-1. В адресе: `?v=1&fill=empty&sz=phone`.

const MemoryCardPrototypePage = () => (
  <ProtoProvider defaults={{ fill: "full" }}>
    <Picker
      params={<Params rows={[["fill", "записей", [["full", "много"], ["empty", "пусто"]]]]} />}
      variants={[
        { Component: () => <Mounted><Column /></Mounted>, name: "Колонкой", pickerTop: true },
        { Component: () => <Mounted><Balance /></Mounted>, name: "Баланс", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryCardPrototypePage;
