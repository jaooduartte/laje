import { useCallback, useEffect, useState } from "react";
import {
  fetchInterlajeOverallStandings,
  type InterlajeOverallStanding,
} from "@/domain/interlaje/interlajeOverallStandings.repository";
import { supabase } from "@/integrations/supabase/client";

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

  const refetch = useCallback(async () => {
    if (!enabled || !championshipId || !seasonYear) {
      setStandings([]);
      return;
    }

    setLoading(true);
    const response = await fetchInterlajeOverallStandings(championshipId, seasonYear);
    setStandings(response.data);
    setLoading(false);
  }, [championshipId, enabled, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  useEffect(() => {
    if (!enabled || !championshipId || !seasonYear) {
      return;
    }

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
        void refetch();
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
          table: "championship_individual_team_standings",
          filter: `championship_id=eq.${championshipId}`,
        },
        refreshWhenSeasonMatches,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId, enabled, refetch, seasonYear]);

  return { standings, loading, refetch };
}
