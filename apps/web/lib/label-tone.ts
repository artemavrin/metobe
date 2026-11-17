// One colour per kind of hidden value (P31): the label chips in the chat, the composer, the steps and the settings'
// sandbox, and the type rows of the settings — so a phone reads as a phone everywhere.

const TONES: Record<string, { chip: string; text: string }> = {
  ADDRESS: {
    chip: "bg-rose-500/12 text-rose-700 dark:bg-rose-400/12 dark:text-rose-300",
    text: "text-rose-600 dark:text-rose-400",
  },
  BANK_ACCOUNT: {
    chip: "bg-teal-500/12 text-teal-700 dark:bg-teal-400/12 dark:text-teal-300",
    text: "text-teal-600 dark:text-teal-400",
  },
  DATE_OF_BIRTH: {
    chip: "bg-orange-500/12 text-orange-700 dark:bg-orange-400/12 dark:text-orange-300",
    text: "text-orange-600 dark:text-orange-400",
  },
  EMAIL: {
    chip: "bg-violet-500/12 text-violet-700 dark:bg-violet-400/14 dark:text-violet-300",
    text: "text-violet-600 dark:text-violet-400",
  },
  ID_DOCUMENT: {
    chip: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  PERSON: {
    chip: "bg-sky-500/12 text-sky-700 dark:bg-sky-400/14 dark:text-sky-300",
    text: "text-sky-600 dark:text-sky-400",
  },
  PHONE: {
    chip: "bg-amber-500/14 text-amber-800 dark:bg-amber-400/14 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
  },
};

/** Anything else (an organisation kept hidden, a type the service adds later): the quiet grey chip. */
const OTHER = {
  chip: "bg-foreground/[0.07] text-foreground/80 dark:bg-foreground/10",
  text: "text-muted-foreground",
};

const TAGGED = /^\[\[(?<type>[A-Z][A-Z0-9_]*?)_[0-9a-fA-F]+\]\]$/u;
const PERSON = /^[Пп]ерсон[а-яё]*_/u;

/** The kind of value a label stands for, read from the label itself: `[[PHONE_a91c02]]`, `Персоне_Женщине_7f3a01`. */
export const labelType = (label: string) =>
  PERSON.test(label) ? "PERSON" : (TAGGED.exec(label)?.groups?.type ?? "");

export const toneOf = (type: string) => TONES[type] ?? OTHER;
