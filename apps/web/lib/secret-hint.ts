// A password or a key typed into a message (PLAN M4): the chat says so before it goes, and points at «Мои подключения»,
// where a service is connected without the secret passing through the model. It only reads the draft in the browser and
// never blocks: a false alarm costs a line of text, a miss costs a leaked key.

/** «пароль: Zx9!kq27», «token = abc123def456»: a word for a secret, a sign, a value that is not an ordinary word. */
const ASSIGNED =
  /(?:парол[ьяюе]|password|passwd|pwd|токен|token|секрет|secret|api[\s_-]?key|апи[\s_-]?ключ|ключ\s+api)\s*(?:[:=]|[—–-])\s*["'`]?(?=\S*[\d!@#$%^&*_-])\S{6,}/iu;

/** What keys and tokens of the common services look like by themselves. */
const SHAPES: RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{20,}/u,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{35}\b/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
];

export const looksLikeSecret = (text: string) =>
  ASSIGNED.test(text) || SHAPES.some((shape) => shape.test(text));
