import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseChampionshipSeasonYearsOptions {
  championshipId?: string | null;
  currentSeasonYear?: number | null;
  enabled?: boolean;
}

const CHAMPIONSHIP_SEASON_YEARS_TIMEOUT_MS = 7000;
const CHAMPIONSHIP_SEASON_YEARS_FALLBACK_TIMEOUT_MS = 3500;

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

async function fetchSeasonYearsSequentialFallback(championshipId: string) {
  const years = new Set<number>();
  const queries = [
    supabase
      .from("championship_bracket_editions")
      .select("season_year")
      .eq("championship_id", championshipId),
    supabase
      .from("matches")
      .select("season_year")
      .eq("championship_id", championshipId),
    supabase
      .from("standings")
      .select("season_year")
      .eq("championship_id", championshipId),
    supabase
      .from("championship_individual_events")
      .select("season_year")
      .eq("championship_id", championshipId),
    supabase
      .from("championship_individual_sessions")
      .select("season_year")
      .eq("championship_id", championshipId),
    supabase
      .from("championship_individual_team_standings")
      .select("season_year")
      .eq("championship_id", championshipId),
  ];

  // This path exists only while the consolidated RPC is unavailable. Keep it
  // serialized so a public page load never recreates the previous six-request
  // fan-out against PostgREST.
  for (const query of queries) {
    try {
      const response = await withRequestTimeout(
        query,
        CHAMPIONSHIP_SEASON_YEARS_FALLBACK_TIMEOUT_MS,
      );

      if (!response.error) {
        resolveSeasonYearsFromRows(
          response.data as Array<{ season_year: number | null }> | null,
        ).forEach((seasonYear) => years.add(seasonYear));
      }
    } catch (error) {
      console.warn("Falha temporária ao buscar uma fonte de temporadas:", error);
    }
  }

  return [...years];
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
      let years: number[] = [];

      try {
        // Normal path: one bounded RPC replaces six parallel Data API reads.
        const response = await withRequestTimeout(
          supabase.rpc("get_championship_available_season_years", {
            _championship_id: championshipId,
          }),
          CHAMPIONSHIP_SEASON_YEARS_TIMEOUT_MS,
        );

        if (response.error) {
          throw response.error;
        }

        years = (response.data ?? [])
          .map((row) =>
            Number((row as { season_year?: number | null }).season_year),
          )
          .filter((seasonYear) => Number.isFinite(seasonYear));
      } catch (rpcError) {
        console.warn(
          "RPC consolidada de temporadas indisponível; usando fallback serializado:",
          rpcError,
        );
        years = await fetchSeasonYearsSequentialFallback(championshipId);
      }

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
