import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseChampionshipSeasonYearsOptions {
  championshipId?: string | null;
  currentSeasonYear?: number | null;
  enabled?: boolean;
}

function resolveSeasonYearsFromRows(
  rows: Array<{ season_year: number | null }> | null | undefined,
): number[] {
  return (rows ?? [])
    .map((row) => row.season_year)
    .filter(
      (seasonYear): seasonYear is number =>
        typeof seasonYear == "number" && Number.isFinite(seasonYear),
    );
}

export function useChampionshipSeasonYears({
  championshipId,
  currentSeasonYear,
  enabled = true,
}: UseChampionshipSeasonYearsOptions = {}) {
  const [seasonYears, setSeasonYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSeasonYears = useCallback(async () => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    if (!championshipId) {
      setSeasonYears(
        currentSeasonYear != null && Number.isFinite(currentSeasonYear)
          ? [currentSeasonYear]
          : [],
      );
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [matchesResponse, standingsResponse, bracketEditionsResponse] =
        await Promise.all([
          supabase
            .from("matches")
            .select("season_year")
            .eq("championship_id", championshipId),
          supabase
            .from("standings")
            .select("season_year")
            .eq("championship_id", championshipId),
          supabase
            .from("championship_bracket_editions")
            .select("season_year")
            .eq("championship_id", championshipId),
        ]);

      const nextSeasonYears = new Set<number>();

      resolveSeasonYearsFromRows(
        matchesResponse.data as
          | Array<{ season_year: number | null }>
          | null
          | undefined,
      ).forEach((seasonYear) => nextSeasonYears.add(seasonYear));
      resolveSeasonYearsFromRows(
        standingsResponse.data as
          | Array<{ season_year: number | null }>
          | null
          | undefined,
      ).forEach((seasonYear) => nextSeasonYears.add(seasonYear));
      resolveSeasonYearsFromRows(
        bracketEditionsResponse.data as
          | Array<{ season_year: number | null }>
          | null
          | undefined,
      ).forEach((seasonYear) => nextSeasonYears.add(seasonYear));

      if (currentSeasonYear != null && Number.isFinite(currentSeasonYear)) {
        nextSeasonYears.add(currentSeasonYear);
      }

      setSeasonYears(
        [...nextSeasonYears].sort(
          (firstYear, secondYear) => secondYear - firstYear,
        ),
      );
    } catch (error) {
      console.error("Erro ao carregar anos disponíveis do campeonato:", error);
      setSeasonYears(
        currentSeasonYear != null && Number.isFinite(currentSeasonYear)
          ? [currentSeasonYear]
          : [],
      );
    } finally {
      setLoading(false);
    }
  }, [championshipId, currentSeasonYear, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    void fetchSeasonYears();
  }, [enabled, fetchSeasonYears]);

  return {
    seasonYears,
    loading,
    refetch: fetchSeasonYears,
  };
}
