import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipAwardType, MatchNaipe, TeamDivision } from "@/lib/enums";

export interface AwardsRankingGoalScorer {
  player_id: string;
  player_name: string;
  team_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  goals: number;
}

export interface AwardsRankingBestDefense {
  team_id: string;
  team_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  matches_count: number;
  goals_against: number;
  goals_against_average: number;
}

export interface AwardsRankingDrawResult {
  award_type: ChampionshipAwardType;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  winner_player_id: string | null;
  winner_team_id: string | null;
}

export interface ChampionshipAwardsRankings {
  season_year: number;
  pending_matches_count: number;
  top_scorers: AwardsRankingGoalScorer[];
  best_defenses: AwardsRankingBestDefense[];
  award_draw_results: AwardsRankingDrawResult[];
}

interface UseChampionshipAwardsRankingsOptions {
  championshipId: string | null;
  seasonYear: number | null;
}

export function useChampionshipAwardsRankings({ championshipId, seasonYear }: UseChampionshipAwardsRankingsOptions) {
  const [rankings, setRankings] = useState<ChampionshipAwardsRankings | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!championshipId || !seasonYear) {
      setRankings(null);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("get_championship_score_sheet_awards_rankings", {
        _championship_id: championshipId,
        _season_year: seasonYear,
      });

      if (error) {
        setRankings(null);
        return;
      }

      setRankings((data as ChampionshipAwardsRankings) ?? null);
    } finally {
      setLoading(false);
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void fetch();

    if (!championshipId || !seasonYear) return;

    const channel = supabase
      .channel(`awards-rankings-${championshipId}-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_award_goal_scorers" }, () => void fetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_award_draw_results" }, () => void fetch())
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `championship_id=eq.${championshipId}` },
        () => void fetch(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [championshipId, seasonYear, fetch]);

  return { rankings, loading };
}
