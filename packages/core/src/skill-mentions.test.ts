import { describe, expect, it } from "vitest";

import { skillsIn, splitSkills } from "./skill-mentions";

describe("splitSkills", () => {
  const names = ["pdf-forms", "report"];
  it("picks a known skill at the start or after a space, as a whole name", () => {
    expect(splitSkills("/report за март, потом /pdf-forms.", names)).toEqual([
      { skill: "report" },
      " за март, потом ",
      { skill: "pdf-forms" },
      ".",
    ]);
  });
  it("leaves «и/или», paths and unknown names as text", () => {
    expect(splitSkills("и/или /usr/bin /reporting /other", names)).toEqual([
      "и/или /usr/bin /reporting /other",
    ]);
  });
  it("lists each picked skill once", () => {
    expect(
      skillsIn(["/report", "again /report and /pdf-forms"], names)
    ).toEqual(["report", "pdf-forms"]);
  });
});
