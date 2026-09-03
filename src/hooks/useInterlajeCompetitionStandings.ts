import { useCallback, useEffect, useState } from "react";
import {
  fetchInterlajeCompetitionStandings,
  type InterlajeCompetitionStanding,
} from "@/domain/interlaje/interlajeOverallStandings.repository";
import { supabase } from "@/integrations/supabase/client";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

export function useInterlajeCompetitionStandings({
  championshipId,
  seasonYear,
  sportId,
  naipe,
  division,
  enabled = true,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  sportId?: string | null;
  naipe?: MatchNaipe | null;
  division: TeamDivision | null;
  enabled?: boolean;
}) {
  const [standings, setStandings] = useState<InterlajeCompetitionStanding[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled || !championshipId || !seasonYear || !sportId || !naipe) {
      setStandings([]);
      return;
    }

    setLoading(true);
    const response = await fetchInterlajeCompetitionStandings({
      championshipId,
      seasonYear,
      sportId,
      naipe,
      division,
    });
    setStandings(response.data);
    setLoading(false);
  }, [championshipId, division, enabled, naipe, seasonYear, sportId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

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
      .channel(`interlaje-competition-standings-${championshipId}-${seasonYear}`)
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
          table: "championship_competition_team_disqualifications",
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
