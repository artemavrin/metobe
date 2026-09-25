import { z } from "zod";

// What a logo field may hold: a key of the built-in set, or an uploaded image kept as a data URL (no file storage
// yet). The cap matches the picker's 256 KB, plus the base64 overhead.
export const logoSchema = z.union([
  z.string().regex(/^[a-z0-9-]{1,64}$/u),
  z
    .string()
    .max(360_000)
    .regex(/^data:image\/(?:png|jpeg|webp|svg\+xml)[;,]/u),
]);
