import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeMode } from "@/lib/enums";
import { isThemeMode, resolveEffectiveThemeMode, type ResolvedThemeMode } from "@/lib/theme";

const AUTO_THEME_REFRESH_INTERVAL_MS = 60_000;

function resolveCurrentThemeMode(preferredThemeMode: ThemeMode): ResolvedThemeMode {
  return resolveEffectiveThemeMode(preferredThemeMode, new Date());
}

export function useAutomaticTheme() {
  const [preferredThemeMode, setPreferredThemeModeState] = useState<ThemeMode>(ThemeMode.AUTO);
  const [themeMode, setThemeMode] = useState<ResolvedThemeMode>(() => resolveCurrentThemeMode(ThemeMode.AUTO));

  const setPreferredThemeMode = useCallback((nextThemeMode: ThemeMode) => {
    setPreferredThemeModeState(nextThemeMode);
    setThemeMode(resolveCurrentThemeMode(nextThemeMode));
  }, []);

  const refreshThemeMode = useCallback((nextThemeMode: ThemeMode) => {
    setThemeMode(resolveCurrentThemeMode(nextThemeMode));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode == ThemeMode.DARK);

    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [themeMode]);

  useEffect(() => {
    refreshThemeMode(preferredThemeMode);

    if (preferredThemeMode != ThemeMode.AUTO) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshThemeMode(ThemeMode.AUTO);
    }, AUTO_THEME_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState == "visible") {
        refreshThemeMode(ThemeMode.AUTO);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [preferredThemeMode, refreshThemeMode]);

  useEffect(() => {
    let isMounted = true;

    const applyCurrentUserThemeModePreference = async (hasAuthenticatedUser: boolean) => {
      if (!isMounted) {
        return;
      }

      if (!hasAuthenticatedUser) {
        setPreferredThemeMode(ThemeMode.AUTO);
        return;
      }

      const { data, error } = await supabase.rpc("get_current_user_theme_mode_preference");

      if (!isMounted || error || !isThemeMode(data)) {
        return;
      }

      setPreferredThemeMode(data);
    };

    const initializeThemeModePreference = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await applyCurrentUserThemeModePreference(Boolean(session?.user));
    };

    void initializeThemeModePreference();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyCurrentUserThemeModePreference(Boolean(session?.user));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [setPreferredThemeMode]);

  return {
    preferredThemeMode,
    setPreferredThemeMode,
    themeMode,
    isDarkMode: themeMode == ThemeMode.DARK,
  };
}
