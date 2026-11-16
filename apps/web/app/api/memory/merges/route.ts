import type {
  MemoryMergeCard,
  MemoryMergeSuggestion,
} from "@metobe/contracts/memory";
import { mergeSuggestions } from "@metobe/core/memory";
import type { MemoryEntity } from "@metobe/core/memory";

import { memoryOwner } from "@/lib/memory-route";

// GET /api/memory/merges (ARCH §19.8.5): «Один человек?» for «Не записано» — up to three pairs of cards that may be
// one, by their names, without a model; none the person called different.

export const dynamic = "force-dynamic";

/** A side of a pair as the page shows it; the person's own card is never one. */
const side = (c: MemoryEntity): MemoryMergeCard | null =>
  c.kind === "self"
    ? null
    : { id: c.id, kind: c.kind, name: c.name, role: c.role };

export const GET = async () => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const pairs = await mergeSuggestions(owner);
  return Response.json(
    pairs.flatMap((p) => {
      const keep = side(p.keep);
      const gone = side(p.gone);
      return keep && gone ? [{ gone, keep }] : [];
    }) satisfies MemoryMergeSuggestion[]
  );
};
