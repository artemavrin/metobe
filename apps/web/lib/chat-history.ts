// The sidebar's chat groups. Days are counted in the user's time zone, not the server's: a chat from 23:50 last
// night is «yesterday» for the user even where the server's clock says otherwise.

const CHAT_GROUPS = ["today", "yesterday", "week", "earlier"] as const;
export type ChatGroup = (typeof CHAT_GROUPS)[number];

const DAY = 86_400_000;

/** The calendar day of a moment in a time zone, as a day count — so two of them subtract into days. */
const dayNumber = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / DAY;
};

export const chatGroupOf = (
  updatedAt: Date,
  now: Date,
  timeZone: string
): ChatGroup => {
  const days = dayNumber(now, timeZone) - dayNumber(updatedAt, timeZone);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return days < 7 ? "week" : "earlier";
};

/** Chats, latest first (each with its group from the server), split into the sidebar's groups; empty ones left out. */
export const groupChats = <T extends { group: ChatGroup }>(chats: T[]) =>
  CHAT_GROUPS.map((group) => ({
    chats: chats.filter((chat) => chat.group === group),
    group,
  })).filter((g) => g.chats.length > 0);
