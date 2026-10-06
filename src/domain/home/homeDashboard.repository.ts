import { isAwsBackendEnabled, isSupabaseBackendEnabled } from "@/config/environment";
import { getAwsHomeDashboardMetrics } from "@/integrations/laje-api/public-runtime";
import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipCode } from "@/lib/enums";
import type { HomeDashboardMetrics } from "@/lib/types";

export async function fetchHomeDashboardMetrics(
  seasonYear?: number | null,
  championshipCode?: ChampionshipCode | null,
) {
  if (isAwsBackendEnabled()) {
    try {
      return {
        data: await getAwsHomeDashboardMetrics({ seasonYear, championshipCode }),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error ? error : new Error("Falha ao carregar métricas pela laje-api."),
      };
    }
  }

  if (!isSupabaseBackendEnabled()) {
    return {
      data: null,
      error: new Error("Backend público não configurado."),
    };
  }

  const response = await supabase.rpc("get_home_dashboard_metrics", {
    _championship_code: championshipCode ?? null,
    _season_year: seasonYear ?? null,
  });

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  return {
    data: (response.data ?? null) as HomeDashboardMetrics | null,
    error: null,
  };
}
