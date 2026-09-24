import type { Locale } from "@metobe/i18n/config";
import type { Messages } from "@metobe/i18n/messages";

// Typed translation keys: a missing or misspelled key fails the build.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
