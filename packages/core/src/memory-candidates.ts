import type { MemoryEntity, MemoryRecord } from "./memory";

// What the «Память» model is shown of a person's memory (ARCH §19.8.3): not every card and promise, but the ones a
// message may be about — named in it or in the chat before it, the groups, the cards of the last two weeks; the
// promises of those cards, the person's own recent ones and those that share words with the message. The whole memory
// is still opened in the process; only what is found goes into the prompt. Free of the DB: S15 runs it.

const MIN_STEM = 4;
/** A word of a role or a promise has to be this long to count: «поставщик», «договор» — not «по», «до», «наш». */
const MIN_WORD = 5;
export const MAX_CANDIDATES = 40;
/** Cards of what was kept lately — for «он» and «она»: at most so many, from so many days back. */
const MAX_RECENT = 10;
const RECENT_DAYS = 14;
/** The person's own promises given within so many days come in whoever the other side is. */
const OWN_DAYS = 30;
const DAY_MS = 86_400_000;

const normalize = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

export const wordsOf = (s: string) =>
  normalize(s)
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

/** What a declined word may end in past the common start: «Ольг|е», «Седов|у», «Андре|ем», «Вектор|а». */
const ENDINGS = new Set(
  [
    "",
    "а",
    "я",
    "о",
    "е",
    "и",
    "ы",
    "у",
    "ю",
    "ь",
    "й",
    "ой",
    "ей",
    "ом",
    "ем",
    "ою",
    "ею",
    "ам",
    "ям",
    "ах",
    "ях",
    "ами",
    "ями",
    "ов",
    "ев",
    "ым",
    "им",
    "ых",
    "их",
    "ую",
    "юю",
    "ая",
    "яя",
    "ое",
    "ее",
    "ые",
    "ие",
    "ого",
    "его",
    "ому",
    "ему",
    "ыми",
    "ими",
  ].map(normalize)
);

/**
 * Do two words name the same thing, declined: «Ольге» and «Ольга», «Седову» and «Седов», «Вектора» and «Вектор».
 * They share a start of at least four letters, and what is left of each is an ending: «Ли» and «ли» never match,
 * nor «Марина» and «Мария», nor «пришёл» and «пришлёт».
 */
export const sameWord = (a: string, b: string) => {
  if (a.length < MIN_STEM || b.length < MIN_STEM) {
    return false;
  }
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) {
    common += 1;
  }
  // A shared start that cut an ending short («Ольг|а» — «Ольг|ой») is tried shorter too: «Андре|й» — «Андре|ем».
  for (let at = common; at >= MIN_STEM; at -= 1) {
    if (ENDINGS.has(a.slice(at)) && ENDINGS.has(b.slice(at))) {
      return true;
    }
  }
  return false;
};

const anySame = (words: string[], said: string[]) =>
  words.some((w) => said.some((s) => sameWord(w, s)));

/** The cards a text mentions by a name or an other name, by any word of it. */
export const mentionedCards = (entities: MemoryEntity[], text: string) => {
  const said = wordsOf(text);
  return entities.filter(
    (e) =>
      e.kind !== "self" &&
      [e.name, ...e.aliases].some((name) => anySame(wordsOf(name), said))
  );
};

/** Words that say nothing about whom a promise is with: months, days, «будет», «через». */
const COMMON = new Set(
  [
    "января",
    "февраля",
    "марта",
    "апреля",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
    "понедельника",
    "вторника",
    "среды",
    "четверга",
    "пятницы",
    "субботы",
    "воскресенья",
    "будет",
    "через",
    "чтобы",
    "после",
    "сегодня",
    "завтра",
    "неделе",
    "недели",
    "месяца",
  ].map(normalize)
);

const longWords = (s: string) =>
  wordsOf(s).filter((w) => w.length >= MIN_WORD && !COMMON.has(w));

/** A promise without a deadline comes after every one with it. */
const due = (r: MemoryRecord) => r.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;

const isOpen = (r: MemoryRecord) =>
  r.kind === "commitment" &&
  (r.status === "open" || r.status === "unconfirmed");

/**
 * The cards the model is shown, at most `MAX_CANDIDATES`: named in the text (the message and the chat before it) by a
 * name or an other name; every group; the cards of what was kept in the last two weeks, newest first; those whose role
 * shares a long word with the text («закупщик», «поставщик»). Cut in that order — the named ones are kept first.
 */
export const candidateCards = ({
  entities,
  records,
  text,
  now = new Date(),
}: {
  entities: MemoryEntity[];
  records: MemoryRecord[];
  text: string;
  now?: Date;
}) => {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const since = now.getTime() - RECENT_DAYS * DAY_MS;
  const recent: MemoryEntity[] = [];
  for (const r of records.toSorted(
    (a, b) => b.recordedAt.getTime() - a.recordedAt.getTime()
  )) {
    if (r.recordedAt.getTime() < since || recent.length >= MAX_RECENT) {
      break;
    }
    for (const link of r.entities) {
      const card = byId.get(link.entityId);
      if (card && card.kind !== "self" && !recent.includes(card)) {
        recent.push(card);
      }
    }
  }
  const said = longWords(text);
  const byRole = entities.filter(
    (e) => e.kind !== "self" && e.role && anySame(longWords(e.role), said)
  );
  const groups = entities.filter((e) => e.kind === "group");
  return [
    ...new Set([
      ...mentionedCards(entities, text),
      ...groups,
      ...recent.slice(0, MAX_RECENT),
      ...byRole,
    ]),
  ].slice(0, MAX_CANDIDATES);
};

/**
 * The open promises the model is shown, at most `MAX_CANDIDATES`: those with a candidate card on a side, in the order
 * of the cards (the named ones first); the person's own given in the last 30 days; those sharing a long word with the
 * text («прайс», «договор» — «договор пришёл» finds the promise of a card the text does not name), more shared words
 * first: «подписанный договор» outranks a verb as common as «пришёл». The nearest deadline first within each; a word
 * never pushes out the promises of a card the message names.
 */
export const candidateCommitments = ({
  records,
  cards,
  selfId,
  text,
  now = new Date(),
}: {
  records: MemoryRecord[];
  cards: MemoryEntity[];
  selfId: string | null;
  text: string;
  now?: Date;
}) => {
  const order = new Map(cards.map((c, i) => [c.id, i]));
  const own = cards.length;
  const byWord = own + 1;
  const since = now.getTime() - OWN_DAYS * DAY_MS;
  const said = longWords(text);
  const shared = (r: MemoryRecord) =>
    longWords(r.text).filter((w) => said.some((x) => sameWord(w, x))).length;
  const rank = (r: MemoryRecord) => {
    const at = Math.min(
      ...r.entities.map(
        (e) => order.get(e.entityId) ?? Number.POSITIVE_INFINITY
      )
    );
    if (Number.isFinite(at)) {
      return at;
    }
    if (
      r.entities.some((e) => e.entityId === selfId) &&
      (r.givenAt ?? r.recordedAt).getTime() >= since
    ) {
      return own;
    }
    const words = shared(r);
    // Past every card and own one: more shared words, nearer the front.
    return words > 0 ? byWord + 1 / (words + 1) : null;
  };
  return records
    .flatMap((r) => {
      const at = isOpen(r) ? rank(r) : null;
      return at === null ? [] : [{ at, r }];
    })
    .toSorted(
      (a, b) =>
        a.at - b.at ||
        due(a.r) - due(b.r) ||
        b.r.recordedAt.getTime() - a.r.recordedAt.getTime()
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ r }) => r);
};
