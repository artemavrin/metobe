import { exportMemory } from "@metobe/core/memory-export";

import { memoryOwner } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// GET /api/memory/export (Д7.3): the owner's whole memory as one Markdown file — a download, in the language and the
// time zone of the person.

export const dynamic = "force-dynamic";

export const GET = async () => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const prefs = await getPrefs();
  const text = await exportMemory(owner, {
    language: prefs.locale === "ru" ? "ru" : "en",
    timeZone: prefs.timeZone,
  });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(text, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="memory-${day}.md"`,
      "content-type": "text/markdown; charset=utf-8",
    },
  });
};
