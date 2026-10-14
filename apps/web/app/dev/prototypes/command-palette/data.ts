export interface PaletteChat {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
  /** The first question and the start of the last answer, for the newest chats; "" otherwise. */
  question: string;
  answer: string;
}

export interface PaletteSection {
  id: string;
  label: string;
  hint: string;
  group: string;
  admin: boolean;
}

/** Where a pick would go: the prototype shows it instead of leaving the page. */
export type Go = (where: string) => void;

/** «выр 2026» finds «Выручка по месяцам 2026»: every word of the query, anywhere, in any case. */
export const matches = (query: string, ...texts: string[]) => {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  const hay = texts.join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
};

/** The words of a snippet around the first hit of the query, so the match is in view. */
export const around = (text: string, query: string, width = 90) => {
  const word = query.toLowerCase().split(/\s+/u).find(Boolean);
  const at = word ? text.toLowerCase().indexOf(word) : -1;
  if (at < 0) {
    return text.slice(0, width);
  }
  const from = Math.max(0, at - 30);
  return `${from > 0 ? "…" : ""}${text.slice(from, from + width)}`;
};
