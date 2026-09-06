import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchInterlajeOverallStandings,
  type InterlajeOverallStanding,
} from "@/domain/interlaje/interlajeOverallStandings.repository";
import { supabase } from "@/integrations/supabase/client";

const INTERLAJE_OVERALL_REALTIME_DEBOUNCE_MS = 1000;

export function useInterlajeOverallStandings({
  championshipId,
  seasonYear,
  enabled = true,
  refreshKey,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
  refreshKey?: number;
}) {
  const [standings, setStandings] = useState<InterlajeOverallStanding[]>([]);
  const [loading, setLoading] = useState(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!enabled || !championshipId || !seasonYear) {
      setStandings([]);
      setLoading(false);
      isFetchingRef.current = false;
      hasQueuedRefetchRef.current = false;
      return;
    }

    if (isFetchingRef.current) {
      hasQueuedRefetchRef.current = true;
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);

    try {
      const response = await fetchInterlajeOverallStandings(championshipId, seasonYear);

      // Keep the last known-good standings during transient Data API/database
      // failures. Realtime changes are coalesced below and will trigger a new
      // attempt without blanking an already rendered classification.
      if (!response.error) {
        setStandings(response.data);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;

        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
        }

        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          scheduledRefetchTimeoutRef.current = null;
          void refetch();
        }, INTERLAJE_OVERALL_REALTIME_DEBOUNCE_MS);
      }
    }
  }, [championshipId, enabled, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  useEffect(() => {
    if (!enabled || !championshipId || !seasonYear) {
      return;
    }

    const scheduleRefetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        scheduledRefetchTimeoutRef.current = null;
        void refetch();
      }, INTERLAJE_OVERALL_REALTIME_DEBOUNCE_MS);
    };

    const refreshWhenSeasonMatches = (payload: {
      new?: Record<string, unknown> | null;
      old?: Record<string, unknown> | null;
    }) => {
      const rows = [payload.new, payload.old].filter(
        (row): row is Record<string, unknown> => row != null,
      );

      if (
        rows.length == 0 ||
        rows.some(
          (row) =>
            row.championship_id == championshipId && row.season_year == seasonYear,
        )
      ) {
        scheduleRefetch();
      }
    };

    const channel = supabase
      .channel(`interlaje-overall-standings-${championshipId}-${seasonYear}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "standings",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_matches",
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_individual_team_standings",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_overall_position_point_settings",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_overall_score_adjustments",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_walkover_penalty_counts",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_walkover_penalty_settings",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_competition_team_disqualifications",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, enabled, refetch, seasonYear]);

  return { standings, loading, refetch };
}
