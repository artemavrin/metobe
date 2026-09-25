"use client";

import { Picker } from "../_shared/picker";
import { Deck } from "./deck";
import { ProtoParams, ProtoProvider } from "./flow";
import { Quiet } from "./quiet";
import { Split } from "./split";
import { SplitFrame, SplitNarrow, SplitSlant, SplitV2 } from "./split-v2";

// Sign-in page — decided and in the product (app/(auth)): «· срез», diagonal edge, dots at the bottom, clips and
// texts rotating. History: chose «Раскол»; «Раскол · 2» is the riff: form left, floating brand panel right (video-ready),
// no band on phones, language as a footer row; «· узкая», «· кадр» and «· срез» try a smaller
// or diagonal brand panel. Round 1 kept for reference: «Тихий», «Колода», «Раскол».
const LoginPrototypePage = () => (
  <ProtoProvider>
    <Picker
      variants={[
        { Component: SplitV2, name: "Раскол · 2" },
        { Component: SplitNarrow, name: "· узкая" },
        { Component: SplitFrame, name: "· кадр" },
        { Component: SplitSlant, name: "· срез" },
        { Component: Quiet, name: "Тихий" },
        { Component: Deck, name: "Колода" },
        { Component: Split, name: "Раскол" },
      ]}
      params={<ProtoParams />}
    />
  </ProtoProvider>
);

export default LoginPrototypePage;
