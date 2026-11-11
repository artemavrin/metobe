import type { MemoryOverview } from "@metobe/contracts/memory";
import { memoryStale } from "@metobe/core/memory-due";
import { memoryOverview } from "@metobe/core/memory-page";
import { memoryStateFor } from "@metobe/core/memory-write";

import { MemoryView } from "@/components/memory/memory-view";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

// The «Память» page (ARCH §19, P16): what the memory keeps of the person's work — to look at, correct and delete.
// The list comes with the page; a card, search and «Откуда» are read from /api/memory as the person goes.
const MemoryPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ card?: string | string[] }>;
}) => {
  const [{ user }, prefs, { card }] = await Promise.all([
    getSettingsViewer(),
    getPrefs(),
    searchParams,
  ]);
  if (!user) {
    return null;
  }
  const state = await memoryStateFor(user.id);
  const initial: MemoryOverview = state.on
    ? { ...(await memoryOverview(user.id)), on: true }
    : {
        cards: [],
        me: [],
        off: state.service ? "person" : "service",
        on: false,
        questions: [],
        rules: [],
      };
  // «Давно открыто» (Д2): a way in to «Сверка» while there is something to sort out; a broken read leaves the list as it was.
  const stale = state.on
    ? await memoryStale(user.id, prefs.timeZone).then(
        (rows) => rows.length,
        () => 0
      )
    : 0;
  return (
    <MemoryView
      initial={initial}
      stale={stale}
      start={typeof card === "string" ? card : undefined}
      timeZone={prefs.timeZone}
    />
  );
};

export default MemoryPage;
