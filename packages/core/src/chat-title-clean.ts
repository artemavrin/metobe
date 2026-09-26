// What a title model says, made fit for the sidebar: one line, no quotes or markdown, no final dot, 80 characters.
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
  return bare.length > 80 ? `${bare.slice(0, 79)}…` : bare;
};
