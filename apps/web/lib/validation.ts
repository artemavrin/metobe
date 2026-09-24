import "server-only";
import { getTranslations } from "next-intl/server";

type ValidationKey = "email" | "code" | "name";

/** Contracts carry keys, not text (D31); this turns the first issue into a sentence in the user's language. */
export const translateIssue = async (message: string | undefined) => {
  const t = await getTranslations("validation");
  return message && t.has(message as ValidationKey)
    ? t(message as ValidationKey)
    : message;
};
