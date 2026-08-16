import { useMemo } from "react";
import { useChampionshipSeasonSettings } from "@/hooks/useChampionshipSeasonSettings";
import {
  resolveChampionshipUsesSeasonDivisions,
  resolveEffectiveChampionshipSeasonSettings,
} from "@/lib/championshipSeason";
import type { Championship } from "@/lib/types";

interface UseChampionshipSeasonRuntimeOptions {
  championship?: Championship | null;
  seasonYear?: number | null;
}

export function useChampionshipSeasonRuntime({
  championship,
  seasonYear,
}: UseChampionshipSeasonRuntimeOptions) {
  const { seasonSettings, loading, refetch } = useChampionshipSeasonSettings({
    championshipId: championship?.id ?? null,
    seasonYear: seasonYear ?? null,
  });

  const resolvedSeasonSettings = useMemo(() => {
    return resolveEffectiveChampionshipSeasonSettings({
      championship: championship ?? null,
      seasonSettings,
    });
  }, [championship, seasonSettings]);

  const usesDivisions = useMemo(() => {
    return resolveChampionshipUsesSeasonDivisions({
      championship: championship ?? null,
      seasonSettings,
    });
  }, [championship, seasonSettings]);

  return {
    seasonSettings,
    resolvedSeasonSettings,
    usesDivisions,
    loading,
    refetch,
  };
}
