import { useCallback, useEffect, useState } from "react";
import { ThemeMode } from "@/lib/enums";
import { resolveThemeModeByTime } from "@/lib/theme";

const AUTO_THEME_REFRESH_INTERVAL_MS = 60_000;

function resolveCurrentThemeMode(): ThemeMode {
  return resolveThemeModeByTime(new Date());
}

export function useAutomaticTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveCurrentThemeMode);

  const refreshThemeMode = useCallback(() => {
    setThemeMode(resolveCurrentThemeMode());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode == ThemeMode.DARK);

    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [themeMode]);

  useEffect(() => {
    refreshThemeMode();

    const intervalId = window.setInterval(() => {
      refreshThemeMode();
    }, AUTO_THEME_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState == "visible") {
        refreshThemeMode();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshThemeMode]);

  return {
    themeMode,
    isDarkMode: themeMode == ThemeMode.DARK,
  };
}
