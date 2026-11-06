// A question picks a skill as `/name` — at the start or after a space, the whole name. Only names the user has are
// skills: «и/или» or a path stay text. The thread draws those as badges and the chat loads exactly those skills, so
// both read them here, the same way.

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
