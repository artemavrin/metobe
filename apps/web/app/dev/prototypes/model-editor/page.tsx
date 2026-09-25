"use client";

import { Picker } from "../_shared/picker";
import { DenseVariant } from "./dense";
import { RowsPanelVariant, SectionsVariant, TabsVariant } from "./panels";
import { RowsVariant } from "./rows";
import { SheetVariant } from "./sheet";

// Editing a model in a source (capabilities by hand, prices per any unit).
// Round 1 chose «Панель» (a side sheet); round 2 plays with what goes inside: «Разделы», «Вкладки», «Строки».
// Round 1 kept for reference: its «Панель», inline «Строки» and «Плотный».
const ModelEditorPrototype = () => (
  <Picker
    variants={[
      { Component: SectionsVariant, name: "Разделы" },
      { Component: TabsVariant, name: "Вкладки" },
      { Component: RowsPanelVariant, name: "Строки" },
      { Component: SheetVariant, name: "1 · панель" },
      { Component: RowsVariant, name: "1 · в строке" },
      { Component: DenseVariant, name: "1 · плотный" },
    ]}
  />
);

export default ModelEditorPrototype;
