"use client";

import { Picker } from "../_shared/picker";
import { DenseVariant } from "./dense";
import { RowsVariant } from "./rows";
import { SheetVariant } from "./sheet";

// Editing a model in a source (capabilities by hand, prices per any unit): three directions, round 1.
const ModelEditorPrototype = () => (
  <Picker
    variants={[
      { Component: RowsVariant, name: "Строки" },
      { Component: SheetVariant, name: "Панель" },
      { Component: DenseVariant, name: "Плотный" },
    ]}
  />
);

export default ModelEditorPrototype;
