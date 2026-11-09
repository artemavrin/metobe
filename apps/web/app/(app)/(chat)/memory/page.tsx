import type { MemoryOverview } from "@metobe/contracts/memory";
import { memoryOverview } from "@metobe/core/memory-page";
import { isMemoryOn } from "@metobe/core/memory-write";

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
  const on = await isMemoryOn();
  const initial: MemoryOverview = on
    ? { ...(await memoryOverview(user.id)), on }
    : { cards: [], on, questions: [], rules: [] };
  return (
    <MemoryView
      initial={initial}
      start={typeof card === "string" ? card : undefined}
      timeZone={prefs.timeZone}
    />
  );
};

export default MemoryPage;
