import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipCode } from "@/lib/enums";
import type { HomeDashboardMetrics } from "@/lib/types";

export async function fetchHomeDashboardMetrics(
  seasonYear?: number | null,
  championshipCode?: ChampionshipCode | null,
) {
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
