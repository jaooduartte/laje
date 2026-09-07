import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseChampionshipSeasonYearsOptions {
  championshipId?: string | null;
  currentSeasonYear?: number | null;
  enabled?: boolean;
}

const CHAMPIONSHIP_SEASON_YEARS_TIMEOUT_MS = 7000;

function withRequestTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Supabase request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
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

    setLoading(true);

    try {
      // A single RPC replaces six parallel Data API reads that previously ran
      // on every public championship page load and amplified PostgREST pressure.
      const response = await withRequestTimeout(
        supabase.rpc("get_championship_available_season_years", {
          _championship_id: championshipId,
        }),
        CHAMPIONSHIP_SEASON_YEARS_TIMEOUT_MS,
      );

      if (response.error) {
        throw response.error;
      }

      const years = (response.data ?? [])
        .map((row) => Number((row as { season_year?: number | null }).season_year))
        .filter((seasonYear) => Number.isFinite(seasonYear));

      if (currentSeasonYear != null && Number.isFinite(currentSeasonYear)) {
        years.push(currentSeasonYear);
      }

      setSeasonYears(
        [...new Set(years)].sort(
          (firstYear, secondYear) => secondYear - firstYear,
        ),
      );
    } catch (error) {
      console.warn(
        "Não foi possível atualizar os anos disponíveis do campeonato; usando a temporada atual como fallback:",
        error,
      );
      setSeasonYears((currentYears) =>
        currentYears.length > 0 ? currentYears : fallbackSeasonYears,
      );
    } finally {
      setLoading(false);
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
