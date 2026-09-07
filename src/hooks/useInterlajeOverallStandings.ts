import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchInterlajeOverallStandings,
  type InterlajeOverallStanding,
} from "@/domain/interlaje/interlajeOverallStandings.repository";
import { supabase } from "@/integrations/supabase/client";

const INTERLAJE_OVERALL_REALTIME_DEBOUNCE_MS = 1000;

function isPublicChampionshipsPage() {
  return (
    typeof window != "undefined" &&
    window.location.pathname.startsWith("/campeonatos")
  );
}

export function useInterlajeOverallStandings({
  championshipId,
  seasonYear,
  enabled = true,
  realtimeEnabled = true,
  refreshKey,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
  realtimeEnabled?: boolean;
  refreshKey?: number;
}) {
  const [standings, setStandings] = useState<InterlajeOverallStanding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);
  const refetchRef = useRef<() => Promise<void>>(async () => undefined);

  const refetch = useCallback(async () => {
    if (!enabled || !championshipId || !seasonYear) {
      setStandings([]);
      setLoading(false);
      setError(null);
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

      if (!response.error) {
        setStandings(response.data);
        setError(null);
      } else {
        setError("Não foi possível carregar a classificação geral. Tente novamente.");
      }
    } catch {
      setError("Não foi possível carregar a classificação geral. Tente novamente.");
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
          void refetchRef.current();
        }, INTERLAJE_OVERALL_REALTIME_DEBOUNCE_MS);
      }
    }
  }, [championshipId, enabled, seasonYear]);

  refetchRef.current = refetch;

  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  useEffect(() => {
    if (!enabled || !championshipId || !seasonYear) {
      return;
    }

    if (!realtimeEnabled || isPublicChampionshipsPage()) {
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
  }, [championshipId, enabled, realtimeEnabled, refetch, seasonYear]);

  return { standings, loading, error, refetch };
}
