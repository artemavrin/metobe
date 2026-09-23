import "@purr/ui/globals.css";
import { cn } from "@purr/ui/lib/utils";
import { Agentation } from "agentation";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

const fontSans = Geist({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});
const fontMono = Geist_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  description: "Self-hosted AI-рабочее место",
  title: "Purr",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <html
    className={cn(
      "font-sans antialiased",
      fontSans.variable,
      fontMono.variable
    )}
    lang="ru"
    suppressHydrationWarning
  >
    <body>
      <ThemeProvider>{children}</ThemeProvider>
      {process.env.NODE_ENV === "development" && <Agentation />}
    </body>
  </html>
);

export default RootLayout;
