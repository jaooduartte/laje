import { useCallback, useEffect, useState } from "react";
import { fetchHomeDashboardMetrics } from "@/domain/home/homeDashboard.repository";
import type { ChampionshipCode } from "@/lib/enums";
import type { HomeDashboardMetrics } from "@/lib/types";

export function useHomeDashboardMetrics(
  seasonYear?: number | null,
  championshipCode?: ChampionshipCode | null,
  enabled = true,
) {
  const [metrics, setMetrics] = useState<HomeDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = useCallback(async () => {
    setLoading(true);

    const { data, error } = await fetchHomeDashboardMetrics(
      seasonYear,
      championshipCode,
    );

    if (error) {
      console.error("Erro ao carregar métricas do dashboard:", error.message);
      setMetrics(null);
      setLoading(false);
      return;
    }

    setMetrics(data);
    setLoading(false);
  }, [championshipCode, seasonYear]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    loadMetrics();
  }, [enabled, loadMetrics]);

  return {
    metrics: enabled ? metrics : null,
    loading: enabled ? loading : false,
    refetch: loadMetrics,
  };
}
