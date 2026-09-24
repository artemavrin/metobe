import "@metobe/ui/globals.css";
import { cn } from "@metobe/ui/lib/utils";
import { Agentation } from "agentation";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";

import { RegionProvider, TimeZoneSync } from "@/components/region";
import { ThemeProvider } from "@/components/theme-provider";
import { getPrefs } from "@/lib/prefs";

const fontSans = Geist({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});
const fontMono = Geist_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
});

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("metadata");
  return { description: t("description"), title: "Metobe" };
};

const RootLayout = async ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const prefs = await getPrefs();
  return (
    <html
      className={cn(
        "font-sans antialiased",
        fontSans.variable,
        fontMono.variable
      )}
      lang={prefs.locale}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <RegionProvider
            value={{ dateFormat: prefs.dateFormat, weekStart: prefs.weekStart }}
          >
            <ThemeProvider>{children}</ThemeProvider>
            <TimeZoneSync
              current={prefs.timeZone}
              manual={prefs.chosen.timeZone !== null}
            />
          </RegionProvider>
        </NextIntlClientProvider>
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
};

export default RootLayout;
