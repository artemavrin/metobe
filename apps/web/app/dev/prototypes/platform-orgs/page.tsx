"use client";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider } from "../memory/frame";
import { OrgsStateProvider } from "./state";
import { AttentionVariant } from "./v-attention";
import { PanelVariant } from "./v-panel";
import { TableVariant } from "./v-table";

// P36 · организации и люди у суперюзера (ORGS-PLAN §10, О5 и О12): список организаций, страница организации, люди,
// счета, отключение и включение, новая организация с приглашением владельцу. Три варианта: «Таблица», «Внимание»,
// «Список и панель». В адресе: `?v=1..3`, экран `scr=orgs|org|people|bills|new`, организация `org=<id>`, день
// `day=25|28|1` (счета выставлены / за 3 дня до срока / 1 декабря, неоплаченные отключены), телефон — `sz=phone`.

const PlatformOrgsPage = () => (
  <ProtoProvider defaults={{ day: "25", org: "meridian", scr: "orgs" }}>
    <OrgsStateProvider>
      <Picker
        params={
          <Params
            rows={[
              ["scr", "экран", [["orgs", "список"], ["org", "организация"], ["people", "люди"], ["bills", "счета"], ["new", "новая"]]],
              ["day", "день", [["25", "25 ноября"], ["28", "28 ноября"], ["1", "1 декабря"]]],
            ]}
          />
        }
        variants={[
          { Component: TableVariant, name: "Таблица" },
          { Component: AttentionVariant, name: "Внимание" },
          { Component: PanelVariant, name: "Список и панель" },
        ]}
      />
    </OrgsStateProvider>
  </ProtoProvider>
);

export default PlatformOrgsPage;
