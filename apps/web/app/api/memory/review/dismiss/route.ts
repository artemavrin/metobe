import { dismissReview, undismissReview } from "@metobe/core/memory";
import { weekStart } from "@metobe/core/memory-due";

import { memoryOwner } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// POST /api/memory/review/dismiss (В2.1): «Убрать» on the «Сверка» row of «Не упустить» — it stays away until Monday.
// DELETE — «Вернуть».

export const dynamic = "force-dynamic";

const week = async () => {
  const { timeZone } = await getPrefs();
  return weekStart(new Date(), timeZone);
};

export const POST = async () => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  await dismissReview(owner, await week());
  return Response.json({ dismissed: true });
};

export const DELETE = async () => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  await undismissReview(owner, await week());
  return Response.json({ dismissed: false });
};
