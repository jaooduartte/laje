import { useCallback, useEffect, useState } from "react";
import { fetchChampionshipSeasonSettings } from "@/domain/championship-seasons/championshipSeason.repository";
import type { ChampionshipSeasonSettings } from "@/lib/types";

interface UseChampionshipSeasonSettingsOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
}

export function useChampionshipSeasonSettings({
  championshipId,
  seasonYear,
}: UseChampionshipSeasonSettingsOptions) {
  const [seasonSettings, setSeasonSettings] = useState<ChampionshipSeasonSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!championshipId || typeof seasonYear != "number") {
      setSeasonSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const response = await fetchChampionshipSeasonSettings(championshipId, seasonYear);

    if (response.error) {
      console.error("Erro ao carregar configuração sazonal:", response.error.message);
      setSeasonSettings(null);
      setLoading(false);
      return;
    }

    setSeasonSettings(response.data);
    setLoading(false);
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    seasonSettings,
    loading,
    refetch,
  };
}
