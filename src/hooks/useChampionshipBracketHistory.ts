import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipBracketView } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketSeasonView } from "@/lib/types";

interface UseChampionshipBracketHistoryOptions {
  championshipId?: string | null;
  seasonYears?: number[];
}

const BRACKET_REALTIME_DEBOUNCE_MS = 1000;
const PUBLIC_BRACKET_POLL_MIN_MS = 45000;
const PUBLIC_BRACKET_POLL_JITTER_MS = 15000;

function isPublicChampionshipsPage() {
  return (
    typeof window != "undefined" &&
    window.location.pathname.startsWith("/campeonatos")
  );
}

function resolvePublicBracketPollDelay() {
  return (
    PUBLIC_BRACKET_POLL_MIN_MS +
    Math.floor(Math.random() * PUBLIC_BRACKET_POLL_JITTER_MS)
  );
}

export function useChampionshipBracketHistory({
  championshipId,
  seasonYears = [],
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
    if (!championshipId || normalizedSeasonYears.length == 0) {
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

      // Do not fan out one RPC per season in parallel. Parallel history reads
      // amplified each public page load into multiple simultaneous expensive
      // PostgREST transactions and contributed to connection pool pressure.
      for (const seasonYear of normalizedSeasonYears) {
        const { data, error } = await fetchChampionshipBracketView(championshipId, seasonYear);

        if (!error && data) {
          seasonViewResponses.push({
            season_year: seasonYear,
            championship_bracket_view: data,
          });
        }
      }

      setChampionshipBracketSeasonViews(seasonViewResponses);
      hasLoadedBracketHistoryRef.current = true;
    } finally {
      setLoading(false);
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;
        void fetchBracketHistoryRef.current();
      }
    }
  }, [championshipId, normalizedSeasonYears]);

  fetchBracketHistoryRef.current = fetchBracketHistory;

  useEffect(() => {
    if (!championshipId || normalizedSeasonYears.length == 0) {
      setChampionshipBracketSeasonViews([]);
      setLoading(false);
      hasLoadedBracketHistoryRef.current = false;
      return;
    }

    void fetchBracketHistory(true);

    if (isPublicChampionshipsPage()) {
      let cancelled = false;

      const scheduleNextPoll = () => {
        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          scheduledRefetchTimeoutRef.current = null;

          if (!cancelled) {
            if (
              typeof document == "undefined" ||
              document.visibilityState == "visible"
            ) {
              void fetchBracketHistory();
            }

            scheduleNextPoll();
          }
        }, resolvePublicBracketPollDelay());
      };

      scheduleNextPoll();

      return () => {
        cancelled = true;
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
          scheduledRefetchTimeoutRef.current = null;
        }
      };
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
  }, [championshipId, fetchBracketHistory, normalizedSeasonYears]);

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
