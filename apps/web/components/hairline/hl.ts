// The engine as one object, the way a Hairline figure takes it (`const { … } = HL`): the figures beside this file are
// generated from spikes/hairline-agents (gen.mjs) and run unchanged on it.
import * as iso from "@/components/hairline/iso";
import * as motion from "@/components/hairline/motion";
import * as stage from "@/components/hairline/stage";

export const HL = { ...iso, ...motion, ...stage };
