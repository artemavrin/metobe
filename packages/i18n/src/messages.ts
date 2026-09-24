import type en from "../messages/en.json";
import type { Locale } from "./config";

export type Messages = typeof en;

/** Static imports per language, so bundlers include exactly these two files. */
export const loadMessages = async (locale: Locale): Promise<Messages> => {
  const file =
    locale === "ru"
      ? await import("../messages/ru.json")
      : await import("../messages/en.json");
  return file.default;
};
