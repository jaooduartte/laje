import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeMode } from "@/lib/enums";
import { isThemeMode, resolveEffectiveThemeMode, type ResolvedThemeMode } from "@/lib/theme";

const AUTO_THEME_REFRESH_INTERVAL_MS = 60_000;
const THEME_PREFERENCE_CACHE_TTL_MS = 5_000;

type ThemePreferenceResult = {
  data: ThemeMode | null;
  error: unknown;
};

let themePreferenceRequest: Promise<ThemePreferenceResult> | null = null;
let themePreferenceCache: {
  userId: string;
  expiresAt: number;
  result: ThemePreferenceResult;
} | null = null;

function resolveCurrentThemeMode(preferredThemeMode: ThemeMode): ResolvedThemeMode {
  return resolveEffectiveThemeMode(preferredThemeMode, new Date());
}

function fetchCurrentUserThemePreference(userId: string) {
  if (
    themePreferenceCache?.userId == userId &&
    themePreferenceCache.expiresAt > Date.now()
  ) {
    return Promise.resolve(themePreferenceCache.result);
  }

  if (themePreferenceRequest) {
    return themePreferenceRequest;
  }

  const request = supabase
    .rpc("get_current_user_theme_mode_preference")
    .then(({ data, error }) => {
      const result: ThemePreferenceResult = {
        data: isThemeMode(data) ? data : null,
        error,
      };

      if (!error) {
        themePreferenceCache = {
          userId,
          expiresAt: Date.now() + THEME_PREFERENCE_CACHE_TTL_MS,
          result,
        };
      }

      return result;
    })
    .finally(() => {
      if (themePreferenceRequest === request) {
        themePreferenceRequest = null;
      }
    });

  themePreferenceRequest = request;
  return request;
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

    const applyCurrentUserThemeModePreference = async (userId: string | null) => {
      if (!isMounted) {
        return;
      }

      if (!userId) {
        themePreferenceCache = null;
        setPreferredThemeMode(ThemeMode.AUTO);
        return;
      }

      const { data, error } = await fetchCurrentUserThemePreference(userId);

      if (!isMounted || error || !data) {
        return;
      }

      setPreferredThemeMode(data);
    };

    const initializeThemeModePreference = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await applyCurrentUserThemeModePreference(session?.user.id ?? null);
    };

    void initializeThemeModePreference();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        void applyCurrentUserThemeModePreference(session?.user.id ?? null);
      }, 0);
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
