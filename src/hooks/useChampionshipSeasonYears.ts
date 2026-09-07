import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseChampionshipSeasonYearsOptions {
  championshipId?: string | null;
  currentSeasonYear?: number | null;
  enabled?: boolean;
}

export function useChampionshipSeasonYears({
  championshipId,
  currentSeasonYear,
  enabled = true,
}: UseChampionshipSeasonYearsOptions = {}) {
  const [seasonYears, setSeasonYears] = useState<number[]>(() =>
    currentSeasonYear != null && Number.isFinite(currentSeasonYear)
      ? [currentSeasonYear]
      : [],
  );
  const [loading, setLoading] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchSeasonYears = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fallbackSeasonYears =
      currentSeasonYear != null && Number.isFinite(currentSeasonYear)
        ? [currentSeasonYear]
        : [];

    if (!championshipId) {
      setSeasonYears(fallbackSeasonYears);
      setLoading(false);
      return;
    }

    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);

    try {
      const response = await supabase.rpc("get_championship_available_season_years", {
        _championship_id: championshipId,
      });

      if (response.error) {
        throw response.error;
      }

      const years = (response.data ?? [])
        .map((row) =>
          Number((row as { season_year?: number | null }).season_year),
        )
        .filter((seasonYear) => Number.isFinite(seasonYear));

      if (currentSeasonYear != null && Number.isFinite(currentSeasonYear)) {
        years.push(currentSeasonYear);
      }

      const normalizedYears = [...new Set(years)].sort(
        (firstYear, secondYear) => secondYear - firstYear,
      );

      setSeasonYears((currentYears) =>
        normalizedYears.length > 0
          ? normalizedYears
          : currentYears.length > 0
            ? currentYears
            : fallbackSeasonYears,
      );
    } catch (error) {
      console.warn(
        "Não foi possível atualizar os anos disponíveis do campeonato; mantendo a temporada atual:",
        error,
      );
      setSeasonYears((currentYears) =>
        currentYears.length > 0 ? currentYears : fallbackSeasonYears,
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [championshipId, currentSeasonYear, enabled]);

  useEffect(() => {
    if (
      currentSeasonYear != null &&
      Number.isFinite(currentSeasonYear)
    ) {
      setSeasonYears((currentYears) =>
        currentYears.includes(currentSeasonYear)
          ? currentYears
          : [currentSeasonYear, ...currentYears].sort(
              (firstYear, secondYear) => secondYear - firstYear,
            ),
      );
    }

    void fetchSeasonYears();
  }, [currentSeasonYear, fetchSeasonYears]);

  return {
    seasonYears,
    loading,
    refetch: fetchSeasonYears,
  };
}
