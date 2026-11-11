import type { Segment, Token } from "@/components/chat/token-editor";

// A text pasted into the composer, read as the composer reads what is typed: `@Name` of a server or of a card of the
// memory and `/name` of a skill become badges where they stand, the rest stays text. Only what is known by its whole
// name — «@Андрей» is not a card, «/usr/bin» is not a skill — and a name two cards share is left as text: a badge
// carries an id, and a pasted name cannot say which one it meant.

export interface Known {
  servers: Token[];
  skills: Token[];
  cards: Token[];
}

interface Candidate {
  sign: "@" | "/";
  token: Token;
  /** Lower case, with its sign: what is compared. */
  key: string;
}

const lower = (s: string) => s.toLocaleLowerCase("ru");

/** Whether a name ends where it stands: at the end, or before something that is not a letter, a digit, `_` or `-`. */
const endsThere = (text: string, at: number) =>
  at >= text.length || !/[\p{L}\p{N}_-]/u.test(text.charAt(at));

const candidatesOf = (known: Known): Candidate[] => {
  const servers = known.servers.map((token) => ({
    key: lower(`@${token.label}`),
    sign: "@" as const,
    token,
  }));
  const taken = new Set(servers.map((c) => c.key));
  const counts = new Map<string, number>();
  for (const card of known.cards) {
    const key = lower(`@${card.label}`);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cards = known.cards
    .map((token) => ({
      key: lower(`@${token.label}`),
      sign: "@" as const,
      token,
    }))
    // A server of the same name wins (it is what the text said before cards came); shared names are not guessed.
    .filter((c) => !taken.has(c.key) && counts.get(c.key) === 1);
  const skills = known.skills.map((token) => ({
    key: lower(`/${token.label}`),
    sign: "/" as const,
    token,
  }));
  // Longest first, so «@GitHub Enterprise» wins over «@GitHub».
  // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted is past the ES2022 target
  return [...servers, ...cards, ...skills].sort(
    (a, b) => b.key.length - a.key.length
  );
};

/** The candidate whose name starts at a point of the text, if one does — a sign after a space, then the whole name. */
const matchAt = (candidates: Candidate[], text: string, at: number) => {
  const sign = text.charAt(at);
  if (
    !(
      (sign === "@" || sign === "/") &&
      (at === 0 || /\s/u.test(text.charAt(at - 1)))
    )
  ) {
    return;
  }
  return candidates.find(
    (c) =>
      c.sign === sign &&
      lower(text.slice(at, at + c.key.length)) === c.key &&
      endsThere(text, at + c.key.length)
  );
};

/** The text cut into plain pieces and badges, in order. */
export const tokenizePaste = (text: string, known: Known): Segment[] => {
  const candidates = candidatesOf(known);
  if (candidates.length === 0) {
    return [text];
  }
  const out: Segment[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const hit = matchAt(candidates, text, i);
    if (hit) {
      if (plain) {
        out.push(plain);
        plain = "";
      }
      out.push(hit.token);
      i += hit.key.length;
    } else {
      plain += text.charAt(i);
      i += 1;
    }
  }
  if (plain) {
    out.push(plain);
  }
  return out;
};
