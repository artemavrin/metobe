// P8 · «Мои подключения»: the MCP servers a user may use, and their own credentials to the per-user ones. Only what
// the product really has: a catalog item's title, logo, auth kind, header name, tool count and credentials mode; a
// connection's status (active / needs_reauth / error), last error, last use and creation time.

export type AuthKind = "bearer" | "header" | "basic" | "oauth";
export type ConnectionStatus = "active" | "needs_reauth" | "error";

export type Server = {
  id: string;
  title: string;
  /** An uploaded picture (data URL); without one — the first letter. */
  logo?: string;
  auth: AuthKind;
  /** For `header` auth: the header's name, set by the admin. */
  headerName?: string;
  /** The tools this user gets from it (the admin's allowlist applied). */
  toolCount: number;
  /** `shared` — the admin's one account for everyone; `per_user` — each user connects on their own. */
  mode: "per_user" | "shared";
  /** A shared server whose account does not work: only the admin can fix it (listChatServers → signIn: "admin"). */
  adminOnly?: boolean;
};

export type Connection = {
  status: ConnectionStatus;
  lastError?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  /** Basic auth: the login (not a secret). */
  login?: string;
  /** A token's or header value's hint — «ksk_…9f2a»; a password or a short secret gets «••••••». */
  hint?: string;
};

const svg = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(body)}`;

// Pictures the admin uploaded, drawn on their own backgrounds, as uploads are.
const GITHUB = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 36 36"><rect x="-6" y="-6" width="36" height="36" fill="#24292f"/><path fill="#fff" fill-rule="evenodd" d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"/></svg>'
);
const NOTION = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 34 34"><rect x="-5" y="-5" width="34" height="34" fill="#fff"/><path fill="#000" fill-rule="evenodd" d="M15.257.055l-13.31.98C.874 1.128.5 1.83.5 2.667v14.559c0 .654.233 1.213.794 1.96l3.129 4.06c.513.653.98.794 1.962.745l15.457-.932c1.307-.093 1.681-.7 1.681-1.727V4.954c0-.53-.21-.684-.829-1.135l-.106-.078L18.34.755c-1.027-.746-1.45-.84-3.083-.7zm-8.521 4.63c-1.263.086-1.549.105-2.266-.477L2.647 2.76c-.186-.187-.092-.42.375-.466l12.796-.933c1.074-.094 1.634.28 2.054.606l2.195 1.587c.093.047.326.326.047.326l-13.216.794-.162.01zM5.263 21.193V7.287c0-.606.187-.886.748-.933l15.176-.886c.515-.047.748.28.748.886v13.81c0 .609-.093 1.122-.934 1.168l-14.523.84c-.842.047-1.215-.232-1.215-.98zm14.338-13.16c.093.422 0 .842-.422.89l-.699.139v10.264c-.608.327-1.168.513-1.635.513-.747 0-.934-.232-1.495-.932l-4.576-7.185v6.952l1.448.327s0 .84-1.169.84l-3.221.186c-.094-.187 0-.654.327-.747l.84-.232V9.853L7.832 9.76c-.093-.42.14-1.026.794-1.073l3.456-.232 4.763 7.279v-6.44l-1.214-.14c-.094-.513.28-.887.747-.933l3.223-.187z"/></svg>'
);
const FIGMA = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 36 36"><rect x="-6" y="-6" width="36" height="36" fill="#fff"/><path d="M4 20a4 4 0 014-4h4v4a4 4 0 01-8 0z" fill="#24CB71"/><path d="M12 0v8h4a4 4 0 000-8h-4z" fill="#FF7237"/><path d="M15.967 16a4 4 0 100-8 4 4 0 000 8z" fill="#00B6FF"/><path d="M4 4a4 4 0 004 4h4V0H8a4 4 0 00-4 4z" fill="#FF3737"/><path d="M4 12a4 4 0 004 4h4V8H8a4 4 0 00-4 4z" fill="#874FFF"/></svg>'
);

export const SERVERS: Server[] = [
  { auth: "basic", id: "bitrix", mode: "per_user", title: "Битрикс24", toolCount: 14 },
  { auth: "bearer", id: "kaskad", mode: "per_user", title: "КАСКАД", toolCount: 9 },
  { auth: "oauth", id: "github", logo: GITHUB, mode: "per_user", title: "GitHub", toolCount: 26 },
  { auth: "header", headerName: "X-API-Key", id: "stock", mode: "per_user", title: "Склад", toolCount: 6 },
  { auth: "oauth", id: "notion", logo: NOTION, mode: "per_user", title: "Notion", toolCount: 11 },
  { auth: "oauth", id: "figma", logo: FIGMA, mode: "per_user", title: "Figma", toolCount: 8 },
  { auth: "bearer", id: "kb", mode: "shared", title: "База знаний", toolCount: 4 },
  { adminOnly: true, auth: "basic", id: "buh", mode: "shared", title: "1С:Бухгалтерия", toolCount: 12 },
];

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

export const seedConnections = (): Record<string, Connection> => ({
  bitrix: { createdAt: ago(60 * 24 * 12), lastUsedAt: ago(125), login: "a.smirnova", status: "active" },
  github: {
    createdAt: ago(60 * 24 * 64),
    lastError: "Вход в GitHub истёк — войдите заново",
    lastUsedAt: ago(60 * 24 * 9),
    status: "needs_reauth",
  },
  kaskad: { createdAt: ago(60 * 24 * 40), hint: "ksk_…9f2a", lastUsedAt: ago(60 * 26), status: "active" },
  stock: {
    createdAt: ago(60 * 24 * 21),
    hint: "••••••",
    lastError: "Сервер ответил 401: ключ не подходит",
    lastUsedAt: ago(60 * 24 * 3),
    status: "error",
  },
});

export const PERSON = { email: "a.smirnova@sever-group.ru", name: "Анна Смирнова" };

/** What the UI may show of a secret, as the product does: a prefix and the tail of a long key, nothing of a short one. */
export const hintOf = (value: string) =>
  value.length < 12 ? "••••••" : `${/^[A-Za-z]{2,6}[-_]/u.exec(value)?.[0] ?? value.slice(0, 4)}…${value.slice(-4)}`;

export const AUTH_LABEL: Record<AuthKind, string> = {
  basic: "Логин и пароль",
  bearer: "Токен",
  header: "Заголовок",
  oauth: "OAuth",
};

/** The secret field's label: a token, a header's value, a password. */
export const secretLabel = (s: Server) => {
  if (s.auth === "header") return s.headerName ?? "Значение заголовка";
  if (s.auth === "basic") return "Пароль";
  return "Токен";
};

export const toolsWord = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} тул`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} тула`;
  return `${n} тулов`;
};
