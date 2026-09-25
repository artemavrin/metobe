import type { SourceFailure } from "@metobe/contracts/models";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<"sources">>;

/** A failed check in words: what happened and what to do (ARCH UX §4). */
export const failureText = (
  t: T,
  reason: SourceFailure | "proxy-invalid" | "proxy-unreachable",
  title: string,
  status?: number
) => {
  const key = (
    {
      auth: "auth",
      http: "http",
      invalid: "invalid",
      "not-found": "notFound",
      "proxy-invalid": "proxyInvalid",
      "proxy-unreachable": "proxyUnreachable",
      unreachable: "unreachable",
    } as const
  )[reason];
  const values = { status: status ?? "", title };
  return {
    text: t(`failure.${key}.text`, values),
    title: t(`failure.${key}.title`, values),
  };
};
