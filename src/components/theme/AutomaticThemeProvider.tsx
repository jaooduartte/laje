import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAutomaticTheme } from "@/hooks/useAutomaticTheme";
import type { ThemeMode } from "@/lib/enums";

interface AutomaticThemeContextValue {
  themeMode: ThemeMode;
  isDarkMode: boolean;
}

const AutomaticThemeContext = createContext<AutomaticThemeContextValue | null>(null);

interface AutomaticThemeProviderProps {
  children: ReactNode;
}

export function AutomaticThemeProvider({ children }: AutomaticThemeProviderProps) {
  const { themeMode, isDarkMode } = useAutomaticTheme();

  const automaticThemeContextValue = useMemo(
    () => ({
      themeMode,
      isDarkMode,
    }),
    [isDarkMode, themeMode],
  );

  return (
    <AutomaticThemeContext.Provider value={automaticThemeContextValue}>
      {children}
    </AutomaticThemeContext.Provider>
  );
}

export function useAutomaticThemeContext() {
  const automaticThemeContext = useContext(AutomaticThemeContext);

  if (!automaticThemeContext) {
    throw new Error("useAutomaticThemeContext must be used within AutomaticThemeProvider");
  }

  return automaticThemeContext;
}
