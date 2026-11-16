"use client";

import { Picker } from "../../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../../memory/frame";
import { List, OneByOne, Sections } from "./variants";

// P17 · раунд 1: план на день отдельной страницей вместо главной (D39) — отвергнут: главная остаётся экраном нового чата. В адресе: `?v=1&n=7&mem=empty&sz=phone`.

const TodayPrototypePage = () => (
  <ProtoProvider defaults={{ mem: "full", n: "7" }}>
    <Picker
      params={
        <Params
          rows={[
            ["n", "пунктов", [["0", "нет"], ["3", "3"], ["7", "7"]]],
            ["mem", "память", [["full", "есть"], ["empty", "пустая"]]],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><List /></Mounted>, name: "Список", pickerTop: true },
        { Component: () => <Mounted><Sections /></Mounted>, name: "По разделам", pickerTop: true },
        { Component: () => <Mounted><OneByOne /></Mounted>, name: "По одному", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default TodayPrototypePage;
