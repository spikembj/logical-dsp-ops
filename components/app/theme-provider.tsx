"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App-wide theme provider. attribute="class" toggles a `.dark` class on
 * <html>, which our globals.css uses to swap CSS custom properties.
 *
 * defaultTheme="system" follows the user's OS preference until they pick
 * one explicitly via the toggle.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
