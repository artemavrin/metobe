import type { MemoryEntity, MemoryRecord } from "./memory";
import type { KnownRecord } from "./memory-extract";
import { fullNames } from "./memory-names";

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

/**
 * Do two words name the same person: the same word declined, or a short form and its full name — «Оле» and «Ольга»,
 * «Павлу» and «Павел», «Саша» and «Александру» (`fullNames`).
 */
export const sameName = (a: string, b: string) => {
  if (sameWord(a, b)) {
    return true;
  }
  const fa = fullNames(a);
  const fb = fullNames(b);
  if (fa.length === 0 && fb.length === 0) {
    return false;
  }
  // A short form's full names against the other word, or against its full names: «Саша» and «Шура».
  const as = fa.length > 0 ? fa : [a];
  const bs = fb.length > 0 ? fb : [b];
  return as.some((x) => bs.some((y) => x === y || sameWord(x, y)));
};

const anySame = (words: string[], said: string[]) =>
  words.some((w) => said.some((s) => sameWord(w, s)));

/** The cards a text mentions by a name or an other name, by any word of it. */
export const mentionedCards = (entities: MemoryEntity[], text: string) => {
  const said = wordsOf(text);
  return entities.filter(
    (e) =>
      e.kind !== "self" &&
      [e.name, ...e.aliases].some((name) =>
        wordsOf(name).some((w) => said.some((x) => sameName(w, x)))
      )
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
 * The cards the model is shown, at most `MAX_CANDIDATES` — all of them while the memory has no more than that. In a
 * bigger one: named in the text (the message and the chat before it) by a
 * name or an other name; every group; the cards of what was kept in the last two weeks, newest first; those whose role
 * shares a long word with the text («закупщик», «поставщик»). Cut in that order — the named ones are kept first.
 */
export const candidateCards = ({
  entities,
  records,
  text,
  now = new Date(),
  named = [],
}: {
  entities: MemoryEntity[];
  records: MemoryRecord[];
  text: string;
  now?: Date;
  /** Cards the person named with `@` (Д4), by id: they lead, whatever the words say. */
  named?: string[];
}) => {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const since = now.getTime() - RECENT_DAYS * DAY_MS;
  const recent: MemoryEntity[] = [];
  // oxlint-disable-next-line unicorn/no-array-sort -- a copy; toSorted is past the ES2022 target
  for (const r of [...records].sort(
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
  const cards = entities.filter((e) => e.kind !== "self");
  return [
    ...new Set([
      ...entities.filter((e) => e.kind !== "self" && named.includes(e.id)),
      ...mentionedCards(entities, text),
      ...groups,
      ...recent.slice(0, MAX_RECENT),
      ...byRole,
      // A memory that fits whole is shown whole: the pick is for a big one, and a name the words do not catch
      // («Лёха», «шеф») is still the model's to place.
      ...(cards.length <= MAX_CANDIDATES ? cards : []),
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
  return (
    records
      .flatMap((r) => {
        const at = isOpen(r) ? rank(r) : null;
        return at === null ? [] : [{ at, r }];
      })
      // oxlint-disable-next-line unicorn/no-array-sort -- flatMap gave a fresh array; toSorted is past the ES2022 target
      .sort(
        (a, b) =>
          a.at - b.at ||
          due(a.r) - due(b.r) ||
          b.r.recordedAt.getTime() - a.r.recordedAt.getTime()
      )
      .slice(0, MAX_CANDIDATES)
      .map(({ r }) => r)
  );
};

/** Facts per card, and in all, that a new item may replace (ARCH §19.9.3). */
const KNOWN_PER_CARD = 5;
const MAX_KNOWN_FACTS = 30;
/** Events coming up and those of the last week: «не во вторник, а в среду» is about one that has just passed. */
const MAX_KNOWN_EVENTS = 15;
const EVENT_BACK_DAYS = 7;

const linksOf = (r: MemoryRecord) => r.entities.map((e) => e.entityId);
const newest = (r: MemoryRecord) => (r.validFrom ?? r.recordedAt).getTime();

/**
 * The facts that hold now and the events around today of the cards the model is shown, each under a short ref
 * («f1», «e1») so that an item can say it replaces one (ARCH §19.9.3). Facts: up to five of the newest on a card, the
 * cards in the order they were given (the named ones first), then the person's own, thirty in all; facts about who is
 * in a group are `leaves`' business, not replaced here. Events: coming ones and those of the last seven days,
 * the nearest to today first, fifteen. Assessments are never shown — a changed opinion is a second assessment with a
 * date, not a replacement.
 */
export const candidateKnown = ({
  entities,
  records,
  cards,
  selfId,
  now = new Date(),
}: {
  entities: MemoryEntity[];
  records: MemoryRecord[];
  /** The candidate cards, the named ones first. */
  cards: MemoryEntity[];
  selfId: string | null;
  now?: Date;
}): KnownRecord[] => {
  const groups = new Set(
    entities.filter((e) => e.kind === "group").map((e) => e.id)
  );
  const facts = records.filter(
    (r) =>
      r.kind === "fact" &&
      !r.validTo &&
      !linksOf(r).some((id) => groups.has(id))
  );
  const ids = [...cards.map((c) => c.id), ...(selfId ? [selfId] : [])];
  const seen = new Set<string>();
  const shownFacts: MemoryRecord[] = [];
  for (const id of ids) {
    const mine = facts
      .filter((r) => linksOf(r).includes(id) && !seen.has(r.id))
      // oxlint-disable-next-line unicorn/no-array-sort -- filter gave a fresh array; toSorted is past the ES2022 target
      .sort((a, b) => newest(b) - newest(a))
      .slice(0, KNOWN_PER_CARD);
    for (const r of mine) {
      if (shownFacts.length < MAX_KNOWN_FACTS) {
        seen.add(r.id);
        shownFacts.push(r);
      }
    }
  }
  const from = now.getTime() - EVENT_BACK_DAYS * DAY_MS;
  const cardIds = new Set(cards.map((c) => c.id));
  const shownEvents = records
    .filter(
      (r) =>
        r.kind === "event" &&
        r.occurredAt &&
        r.occurredAt.getTime() >= from &&
        linksOf(r).some((id) => cardIds.has(id))
    )
    // oxlint-disable-next-line unicorn/no-array-sort -- filter gave a fresh array; toSorted is past the ES2022 target
    .sort(
      (a, b) =>
        Math.abs((a.occurredAt?.getTime() ?? 0) - now.getTime()) -
        Math.abs((b.occurredAt?.getTime() ?? 0) - now.getTime())
    )
    .slice(0, MAX_KNOWN_EVENTS);
  return [
    ...shownFacts.map((r, i): KnownRecord => ({
      entityIds: linksOf(r),
      id: r.id,
      kind: "fact",
      on: r.validFrom,
      ref: `f${i + 1}`,
      text: r.text,
    })),
    ...shownEvents.map((r, i): KnownRecord => ({
      entityIds: linksOf(r),
      id: r.id,
      kind: "event",
      on: r.occurredAt,
      ref: `e${i + 1}`,
      text: r.text,
    })),
  ];
};

/** At most so many «Один человек?» at once: a few to decide, not a list to work through. */
export const MAX_SAME = 3;

/** Between two names a short word counts too: «Ли» is «Ли» (in a message it may be the particle «ли»). */
const nameWord = (a: string, b: string) => a === b || sameName(a, b);

/** Every word of `a` is a word of `b`, declined or not: «Ольга» in «Ольга Ли», «Вектор» in «ООО «Вектор»». */
const within = (a: string[], b: string[]) =>
  a.length > 0 && a.every((w) => b.some((x) => nameWord(w, x)));

/** «А» and «Андрей», «Андрею» and «Андрей»: an initial or the same name. */
const sameFirst = (a: string, b: string) =>
  sameWord(a, b) ||
  (a.length === 1 && b.startsWith(a)) ||
  (b.length === 1 && a.startsWith(b));

/** «Андрей Ковалёв» and «А. Ковалёв», «Ковалёв Андрей»: a surname in common and nothing that differs. */
const samePerson = (a: string[], b: string[]) =>
  a.length >= 2 &&
  b.length >= 2 &&
  a.some((w) => w.length > 1 && b.some((x) => nameWord(w, x))) &&
  a.every((w) => b.some((x) => sameFirst(w, x)));

/**
 * Pairs of cards that may be one (ARCH §19.8.5), without a model: of one kind, where the words of a name are all in
 * the other's («Ольга» — «Ольга Ли») or, for people, a surname matches and the first names agree («Андрей Ковалёв» —
 * «А. Ковалёв»). Pairs said to be different (`dismissed`, by `pairKey`) are left out; the longer name is kept.
 */
export const likelySame = (
  entities: MemoryEntity[],
  /** Said to be different («Разные»). */
  different: (a: string, b: string) => boolean
) => {
  const cards = entities.filter((e) => e.kind !== "self");
  const names = new Map(
    cards.map((e) => [e.id, [e.name, ...e.aliases].map(wordsOf)])
  );
  const pairs: { keep: MemoryEntity; gone: MemoryEntity }[] = [];
  for (const [i, a] of cards.entries()) {
    for (const b of cards.slice(i + 1)) {
      if (a.kind !== b.kind || different(a.id, b.id)) {
        continue;
      }
      const an = names.get(a.id) ?? [];
      const bn = names.get(b.id) ?? [];
      const alike = an.some((x) =>
        bn.some(
          (y) =>
            within(x, y) ||
            within(y, x) ||
            (a.kind === "person" && samePerson(x, y))
        )
      );
      if (alike) {
        const [keep, gone] =
          wordsOf(a.name).length >= wordsOf(b.name).length ? [a, b] : [b, a];
        pairs.push({ gone, keep });
      }
    }
  }
  return pairs.slice(0, MAX_SAME);
};
