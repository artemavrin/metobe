// What a title model says, made fit for the sidebar: one line, no quotes or markdown, no final dot, 80 characters.

const ECHO =
  /^(?:the\s+)?(?:user'?s?\s+)?(?:first\s+|new\s+)?(?:user\s+)?(?:message|chat|conversation)(?:\s+title)?$|^(?:первое\s+)?сообщение(?:\s+пользователя)?$|^новый\s+чат$/iu;
export const cleanTitle = (raw: string) => {
  const line =
    raw
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const bare = line
    .replace(/^(?:title|название)\s*:\s*/iu, "")
    .replaceAll(/[*_`#]/gu, "")
    .replace(/^["'«„“]+/u, "")
    .replace(/["'»“”.。]+$/u, "")
    .trim();
  // A title that names the message rather than its topic — the model echoing its task — is no title.
  if (ECHO.test(bare)) {
    return "";
  }
  return bare.length > 80 ? `${bare.slice(0, 79)}…` : bare;
};
