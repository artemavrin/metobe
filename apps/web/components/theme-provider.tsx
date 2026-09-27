"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export const ThemeProvider = ({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme="system"
    disableTransitionOnChange
    enableSystem
    // The no-flash script does its work in the server's HTML; on the client React 19 warns about any executable
    // <script> it renders, so there it is inert text (the attribute differs on purpose, hence no hydration warning).
    scriptProps={{
      suppressHydrationWarning: true,
      type: typeof window === "undefined" ? undefined : "text/plain",
    }}
    {...props}
  >
    {children}
  </NextThemesProvider>
);
