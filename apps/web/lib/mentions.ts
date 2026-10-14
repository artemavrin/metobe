// A question names an MCP server as `@Title` — how the composer writes a mention. The thread draws those as badges
// and the chat gives the model the tools of exactly those servers, so both read mentions here, the same way.

const escape = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/** A text cut into its plain pieces and the servers it mentions, in order. */
export const splitMentions = <S extends { title: string }>(
  text: string,
  servers: S[]
): (string | S)[] => {
  // Longest first, so «GitHub Enterprise» wins over «GitHub».
  const titles = servers.map((s) => s.title).filter(Boolean);
  // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted is past the ES2022 target
  titles.sort((a, b) => b.length - a.length);
  if (titles.length === 0) {
    return [text];
  }
  const pieces: (string | S)[] = [];
  let at = 0;
  for (const match of text.matchAll(
    new RegExp(`@(?:${titles.map(escape).join("|")})`, "gu")
  )) {
    const server = servers.find((s) => `@${s.title}` === match[0]);
    if (server) {
      if (match.index > at) {
        pieces.push(text.slice(at, match.index));
      }
      pieces.push(server);
      at = match.index + match[0].length;
    }
  }
  if (at < text.length) {
    pieces.push(text.slice(at));
  }
  return pieces;
};

/** The servers the texts mention, each once, in the order first mentioned. */
export const mentionedIn = <S extends { id: string; title: string }>(
  texts: string[],
  servers: S[]
) => [
  ...new Set(
    texts.flatMap((text) =>
      splitMentions(text, servers).flatMap((piece) =>
        typeof piece === "string" ? [] : [piece.id]
      )
    )
  ),
];

// A question picks a skill as `/name` — at the start or after a space, the whole name. Only names the user has are
// skills: «и/или» or a path stay text.

/** A text cut into its plain pieces and the skills it picks (by name), in order. */
export const splitSkills = (
  text: string,
  names: string[]
): (string | { skill: string })[] => {
  if (names.length === 0) {
    return [text];
  }
  const known = new Set(names);
  const pieces: (string | { skill: string })[] = [];
  let at = 0;
  for (const match of text.matchAll(
    /(?<=^|\s)\/(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)(?=$|[\s.,;:!?)])/gu
  )) {
    const name = match.groups?.name ?? "";
    if (known.has(name)) {
      if (match.index > at) {
        pieces.push(text.slice(at, match.index));
      }
      pieces.push({ skill: name });
      at = match.index + match[0].length;
    }
  }
  if (at < text.length) {
    pieces.push(text.slice(at));
  }
  return pieces;
};

/** The skills the texts pick, each once, in the order first picked. */
export const skillsIn = (texts: string[], names: string[]) => [
  ...new Set(
    texts.flatMap((text) =>
      splitSkills(text, names).flatMap((piece) =>
        typeof piece === "string" ? [] : [piece.skill]
      )
    )
  ),
];
