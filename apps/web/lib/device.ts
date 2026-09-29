/** A session's device as people say it: «Chrome на macOS». From the User-Agent, with no library: a few names cover it. */
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//u, "Edge"],
  [/OPR\/|Opera/u, "Opera"],
  [/YaBrowser\//u, "Яндекс Браузер"],
  [/Firefox\/|FxiOS\//u, "Firefox"],
  [/Chrome\/|CriOS\//u, "Chrome"],
  [/Safari\//u, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows/u, "Windows"],
  [/iPhone|iPad|iPod/u, "iOS"],
  [/Android/u, "Android"],
  [/Mac OS X|Macintosh/u, "macOS"],
  [/CrOS/u, "ChromeOS"],
  [/Linux/u, "Linux"],
];

/** The browser and the system of a User-Agent; either is null when it is not one we know. */
export const deviceOf = (userAgent: string | null = "") => {
  const seen = (re: RegExp) => re.test(userAgent ?? "");
  return {
    browser: BROWSERS.find(([re]) => seen(re))?.[1] ?? null,
    system: SYSTEMS.find(([re]) => seen(re))?.[1] ?? null,
  };
};

/** An address worth showing: not empty, not loopback and not the «unspecified» one a local run reports. */
export const shownIp = (ip: string | null | undefined) => {
  const value = ip?.trim() ?? "";
  if (
    !value ||
    value === "::1" ||
    value.startsWith("127.") ||
    /^[0:]+$/u.test(value)
  ) {
    return null;
  }
  return value;
};
