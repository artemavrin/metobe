"use client";

import { localeNames, locales } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { cn } from "@metobe/ui/lib/utils";
import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { useTransition } from "react";

import { setLocale } from "@/lib/prefs-actions";

/** Language picker for pages without a profile yet (sign-in, claim). Each language is named in itself. */
export const LanguageSelect = ({ className }: { className?: string }) => {
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <Select
      disabled={pending}
      onValueChange={(value) => start(() => setLocale(String(value)))}
      value={locale}
    >
      <SelectTrigger
        aria-label="Language"
        className={cn("w-auto gap-2", className)}
        size="sm"
      >
        <Languages className="text-muted-foreground" />
        <SelectValue>{localeNames[locale as Locale]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {locales.map((l) => (
          <SelectItem key={l} lang={l} value={l}>
            {localeNames[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
