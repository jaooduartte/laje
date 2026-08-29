import { useMemo } from "react";
import { useChampionshipSeasonSettings } from "@/hooks/useChampionshipSeasonSettings";
import {
  resolveEffectiveChampionshipSeasonSettings,
  type ChampionshipSeasonSettingsShape,
} from "@/lib/championshipSeason";
import type { Championship } from "@/lib/types";

interface UseChampionshipSeasonRuntimeOptions {
  championship?: Championship | null;
  seasonYear?: number | null;
  fallbackSeasonSettings?: ChampionshipSeasonSettingsShape | null;
}

export function useChampionshipSeasonRuntime({
  championship,
  seasonYear,
  fallbackSeasonSettings = null,
}: UseChampionshipSeasonRuntimeOptions) {
  const { seasonSettings, loading, refetch } = useChampionshipSeasonSettings({
    championshipId: championship?.id ?? null,
    seasonYear: seasonYear ?? null,
  });

  const resolvedSeasonSettings = useMemo(() => {
    return resolveEffectiveChampionshipSeasonSettings({
      championship: championship ?? null,
      seasonSettings: seasonSettings ?? fallbackSeasonSettings,
    });
  }, [championship, fallbackSeasonSettings, seasonSettings]);

  const usesDivisions = useMemo(() => {
    return resolvedSeasonSettings.division_format == "SEPARATED";
  }, [resolvedSeasonSettings]);

  return {
    seasonSettings,
    resolvedSeasonSettings,
    usesDivisions,
    loading,
    refetch,
  };
}
