// P9 · «Аккаунт»: what the profile really has — a name, a picture, the sign-in email, a role, the sessions (device,
// when, address), the user's notes for the model, the key that sends a message, the theme and the region. Nothing else.

export const PERSON = {
  email: "a.smirnova@sever-group.ru",
  name: "Анна Смирнова",
  role: "Владелец",
};

export type Session = {
  id: string;
  browser: string;
  system: string;
  /** Minutes ago. */
  ago: number;
  ip?: string;
  current?: boolean;
};

export const SESSIONS: Session[] = [
  {
    ago: 0,
    browser: "Chrome",
    current: true,
    id: "s1",
    ip: "185.71.66.12",
    system: "macOS",
  },
  { ago: 130, browser: "Safari", id: "s2", ip: "178.176.74.3", system: "iOS" },
  {
    ago: 60 * 24 * 5,
    browser: "Firefox",
    id: "s3",
    ip: "185.71.66.40",
    system: "Windows",
  },
];

export const NOTES =
  "Я бухгалтер в торговой компании. Отвечай коротко и по делу, суммы в рублях, даты в формате день.месяц.";

export const ZONES = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Vladivostok",
];

export const ago = (minutes: number) => {
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} ч назад`;
  return `${Math.round(minutes / (60 * 24))} дн назад`;
};
