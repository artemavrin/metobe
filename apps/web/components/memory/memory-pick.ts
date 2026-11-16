// What is open on the «Память» page, and how the list and the page agree on it: the pick lives in the address, so a
// reload or a shared link comes back to the same card — `?card=<id>` or `?view=…`.

export type Pick =
  | { type: "card"; id: string }
  | { type: "me" }
  | { type: "questions" }
  | { type: "due" }
  | { type: "reminders" }
  | { type: "rules" };

const VIEWS = ["me", "questions", "due", "reminders", "rules"] as const;

export const pickFromParams = (params: {
  get: (k: string) => string | null;
}) => {
  const card = params.get("card");
  if (card) {
    return { id: card, type: "card" } satisfies Pick;
  }
  const view = VIEWS.find((v) => v === params.get("view"));
  return view ? ({ type: view } satisfies Pick) : null;
};

/** The address of a pick, on the page it is made on. */
export const pickToSearch = (p: Pick | null) => {
  if (!p) {
    return "/memory";
  }
  return p.type === "card"
    ? `/memory?card=${encodeURIComponent(p.id)}`
    : `/memory?view=${p.type}`;
};

export const samePick = (a: Pick | null, b: Pick) =>
  a?.type === b.type &&
  (b.type !== "card" || (a.type === "card" && a.id === b.id));

/** A word for comparing in search: lower case, «ё» as «е». */
export const normalize = (s: string) =>
  s.toLocaleLowerCase("ru").replaceAll("ё", "е");
