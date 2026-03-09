import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipBracketView } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketSeasonView } from "@/lib/types";

interface UseChampionshipBracketHistoryOptions {
  championshipId?: string | null;
  seasonYears?: number[];
}

export function useChampionshipBracketHistory({
  championshipId,
  seasonYears = [],
}: UseChampionshipBracketHistoryOptions = {}) {
  const [championshipBracketSeasonViews, setChampionshipBracketSeasonViews] = useState<ChampionshipBracketSeasonView[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedBracketHistoryRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizedSeasonYears = useMemo(() => {
    return [...new Set(seasonYears)].sort((firstSeasonYear, secondSeasonYear) => secondSeasonYear - firstSeasonYear);
  }, [seasonYears]);

  const fetchBracketHistory = useCallback(async (shouldShowLoading = false) => {
    if (!championshipId || normalizedSeasonYears.length == 0) {
      setChampionshipBracketSeasonViews([]);
      setLoading(false);
      hasLoadedBracketHistoryRef.current = false;
      return;
    }

    if (shouldShowLoading || !hasLoadedBracketHistoryRef.current) {
      setLoading(true);
    }

    const seasonViewResponses = await Promise.all(
      normalizedSeasonYears.map(async (seasonYear) => {
        const { data, error } = await fetchChampionshipBracketView(championshipId, seasonYear);

        if (error || !data) {
          return null;
        }

        return {
          season_year: seasonYear,
          championship_bracket_view: data,
        } satisfies ChampionshipBracketSeasonView;
      }),
    );

    setChampionshipBracketSeasonViews(
      seasonViewResponses.filter(
        (championshipBracketSeasonView): championshipBracketSeasonView is ChampionshipBracketSeasonView =>
          championshipBracketSeasonView != null,
      ),
    );
    hasLoadedBracketHistoryRef.current = true;
    setLoading(false);
  }, [championshipId, normalizedSeasonYears]);

  useEffect(() => {
    if (!championshipId || normalizedSeasonYears.length == 0) {
      setChampionshipBracketSeasonViews([]);
      setLoading(false);
      hasLoadedBracketHistoryRef.current = false;
      return;
    }

    fetchBracketHistory(true);

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
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracketHistory();
          }, 120);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_matches" }, () => {
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
        }

        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          fetchBracketHistory();
        }, 120);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_groups" }, () => {
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
        }

        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          fetchBracketHistory();
        }, 120);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_competitions" }, () => {
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
        }

        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          fetchBracketHistory();
        }, 120);
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_editions",
          filter: `championship_id=eq.${championshipId}`,
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracketHistory();
          }, 120);
        },
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
