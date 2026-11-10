"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import { OneColumn, WithSide } from "./variants";

// P22 · карточка человека на странице «Память», заново. В адресе: `?v=1&fill=empty&sz=phone`.

const MemoryCardPrototypePage = () => (
  <ProtoProvider defaults={{ fill: "full" }}>
    <Picker
      params={<Params rows={[["fill", "записей", [["full", "много"], ["empty", "пусто"]]]]} />}
      variants={[
        { Component: () => <Mounted><OneColumn /></Mounted>, name: "Одной колонкой", pickerTop: true },
        { Component: () => <Mounted><WithSide /></Mounted>, name: "С боковой", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryCardPrototypePage;
