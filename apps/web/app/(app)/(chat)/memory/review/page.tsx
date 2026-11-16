import { memoryStale } from "@metobe/core/memory-due";
import { isMemoryOnFor } from "@metobe/core/memory-write";
import { redirect } from "next/navigation";

import { ReviewView } from "@/components/memory/review-view";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

// «Сверка» (Д2, P20 «По одному»): the commitments open a long time with nothing happening to them, one on the screen,
// four ways to settle each. `?card=` — only those of one card. Off, the page is not for it: the memory page says why.
const ReviewPage = async ({
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
  if (!(await isMemoryOnFor(user.id))) {
    redirect("/memory");
  }
  const rows = await memoryStale(user.id, prefs.timeZone);
  const only = typeof card === "string" ? card : null;
  return (
    <ReviewView
      now={new Date().toISOString()}
      rows={only ? rows.filter((r) => r.who?.id === only) : rows}
      timeZone={prefs.timeZone}
    />
  );
};

export default ReviewPage;
