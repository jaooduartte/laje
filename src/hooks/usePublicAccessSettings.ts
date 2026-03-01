import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PublicAccessSettings } from "@/lib/types";
import { DEFAULT_PUBLIC_ACCESS_SETTINGS, resolvePublicAccessSettings } from "@/lib/publicAccess";

export function usePublicAccessSettings() {
  const [publicAccessSettings, setPublicAccessSettings] = useState<PublicAccessSettings>(DEFAULT_PUBLIC_ACCESS_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refetchPublicAccessSettings = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_public_access_settings");

    if (error) {
      console.error("Erro ao carregar configurações de acesso público:", error.message);
      setPublicAccessSettings(DEFAULT_PUBLIC_ACCESS_SETTINGS);
      setLoading(false);
      return;
    }

    setPublicAccessSettings(resolvePublicAccessSettings(data as PublicAccessSettings[] | PublicAccessSettings | null));
    setLoading(false);
  }, []);

  useEffect(() => {
    refetchPublicAccessSettings();

    const intervalId = window.setInterval(() => {
      refetchPublicAccessSettings();
    }, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState == "visible") {
        refetchPublicAccessSettings();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refetchPublicAccessSettings]);

  return {
    publicAccessSettings,
    loading,
    refetchPublicAccessSettings,
  };
}
