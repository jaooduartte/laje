import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipBracketView } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketSeasonView } from "@/lib/types";

interface UseChampionshipBracketHistoryOptions {
  championshipId?: string | null;
  seasonYears?: number[];
  enabled?: boolean;
  realtimeEnabled?: boolean;
}

const BRACKET_REALTIME_DEBOUNCE_MS = 1000;
const BRACKET_REQUEST_TIMEOUT_MS = 10000;

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

export function useChampionshipBracketHistory({
  championshipId,
  seasonYears = [],
  enabled = true,
  realtimeEnabled = true,
}: UseChampionshipBracketHistoryOptions = {}) {
  const [championshipBracketSeasonViews, setChampionshipBracketSeasonViews] = useState<ChampionshipBracketSeasonView[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedBracketHistoryRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);
  const fetchBracketHistoryRef = useRef<(shouldShowLoading?: boolean) => Promise<void>>(
    async () => undefined,
  );
  const normalizedSeasonYears = useMemo(() => {
    return [...new Set(seasonYears)].sort((firstSeasonYear, secondSeasonYear) => secondSeasonYear - firstSeasonYear);
  }, [seasonYears]);

  const fetchBracketHistory = useCallback(async (shouldShowLoading = false) => {
    if (!enabled || !championshipId || normalizedSeasonYears.length == 0) {
      setChampionshipBracketSeasonViews([]);
      setLoading(false);
      hasLoadedBracketHistoryRef.current = false;
      isFetchingRef.current = false;
      hasQueuedRefetchRef.current = false;
      return;
    }

    if (isFetchingRef.current) {
      hasQueuedRefetchRef.current = true;
      return;
    }

    isFetchingRef.current = true;

    if (shouldShowLoading || !hasLoadedBracketHistoryRef.current) {
      setLoading(true);
    }

    try {
      const seasonViewResponses: ChampionshipBracketSeasonView[] = [];
      let completedRequests = 0;

      // Keep history reads serialized and bounded. A stalled PostgREST request
      // must never keep the public championship page in a permanent skeleton.
      for (const seasonYear of normalizedSeasonYears) {
        try {
          const { data, error } = await withRequestTimeout(
            fetchChampionshipBracketView(championshipId, seasonYear),
            BRACKET_REQUEST_TIMEOUT_MS,
          );
          completedRequests += 1;

          if (!error && data) {
            seasonViewResponses.push({
              season_year: seasonYear,
              championship_bracket_view: data,
            });
          }
        } catch (error) {
          console.warn(
            `Timeout/erro ao carregar chaveamento do campeonato ${championshipId}, temporada ${seasonYear}:`,
            error,
          );
        }
      }

      // Preserve the last known-good bracket history during transient failures.
      // On the first load, release the skeleton even if Supabase is temporarily
      // unreachable so the rest of the page can continue rendering.
      if (seasonViewResponses.length > 0 || !hasLoadedBracketHistoryRef.current) {
        setChampionshipBracketSeasonViews(seasonViewResponses);
      }

      if (completedRequests > 0 || !hasLoadedBracketHistoryRef.current) {
        hasLoadedBracketHistoryRef.current = true;
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;
        void fetchBracketHistoryRef.current();
      }
    }
  }, [championshipId, enabled, normalizedSeasonYears]);

  fetchBracketHistoryRef.current = fetchBracketHistory;

  useEffect(() => {
    if (!enabled || !championshipId || normalizedSeasonYears.length == 0) {
      setChampionshipBracketSeasonViews([]);
      setLoading(false);
      hasLoadedBracketHistoryRef.current = false;
      return;
    }

    void fetchBracketHistory(true);

    if (!realtimeEnabled) {
      return;
    }

    const scheduleFetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        scheduledRefetchTimeoutRef.current = null;
        void fetchBracketHistory();
      }, BRACKET_REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`championship-bracket-history-realtime-${championshipId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `championship_id=eq.${championshipId}`,
        },
        scheduleFetch,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_matches" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_groups" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_competitions" }, scheduleFetch)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_editions",
          filter: `championship_id=eq.${championshipId}`,
        },
        scheduleFetch,
      )
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, enabled, fetchBracketHistory, normalizedSeasonYears, realtimeEnabled]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    championshipBracketSeasonViews,
    loading,
    refetch: fetchBracketHistory,
  };
}
