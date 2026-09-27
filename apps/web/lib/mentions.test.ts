import { describe, expect, it } from "vitest";

import { mentionedIn, splitMentions } from "./mentions";

const bitrix = { id: "b", title: "Битрикс" };
const github = { id: "g", title: "GitHub" };
const enterprise = { id: "e", title: "GitHub Enterprise" };
const servers = [bitrix, github, enterprise];

describe("mentions in a question", () => {
  it("cuts a text into its pieces and the servers it names", () => {
    expect(splitMentions("найди в @Битрикс сделки", servers)).toEqual([
      "найди в ",
      bitrix,
      " сделки",
    ]);
  });

  it("takes the longest title where one starts another", () => {
    expect(splitMentions("@GitHub Enterprise и @GitHub", servers)).toEqual([
      enterprise,
      " и ",
      github,
    ]);
  });

  it("leaves a text without mentions whole, and an unknown @ as text", () => {
    expect(splitMentions("привет @кто-то", servers)).toEqual([
      "привет @кто-то",
    ]);
    expect(splitMentions("привет", [])).toEqual(["привет"]);
  });

  it("reads a title as text, not a pattern", () => {
    const odd = { id: "o", title: "C++ (beta)" };
    expect(splitMentions("спроси @C++ (beta)", [odd])).toEqual([
      "спроси ",
      odd,
    ]);
  });

  it("gives each mentioned server once, in the order first named", () => {
    expect(
      mentionedIn(["@GitHub и @Битрикс", "ещё раз @GitHub", "как ты"], servers)
    ).toEqual(["g", "b"]);
  });

  it("gives none when no question names a server — as after the one that did was edited away", () => {
    expect(mentionedIn(["как ты"], servers)).toEqual([]);
  });
});
