import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipAwardType, MatchNaipe, TeamDivision } from "@/lib/enums";

export interface AwardsRankingGoalScorer {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  goals: number;
  team_advancement_rank: number;
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

export interface AwardsRankingPendingContext {
  naipe: MatchNaipe;
  division: TeamDivision | null;
  pending_matches_count: number;
}

export interface ChampionshipAwardsRankings {
  season_year: number;
  pending_matches_count: number;
  pending_award_contexts: AwardsRankingPendingContext[];
  top_scorers: AwardsRankingGoalScorer[];
  best_defenses: AwardsRankingBestDefense[];
  award_draw_results: AwardsRankingDrawResult[];
}

export function compareAwardsRankingGoalScorers(
  firstScorer: AwardsRankingGoalScorer,
  secondScorer: AwardsRankingGoalScorer,
  options?: {
    drawWinnerPlayerId?: string | null;
  },
) {
  const goalsDifference = secondScorer.goals - firstScorer.goals;

  if (goalsDifference != 0) {
    return goalsDifference;
  }

  const teamAdvancementDifference = secondScorer.team_advancement_rank - firstScorer.team_advancement_rank;

  if (teamAdvancementDifference != 0) {
    return teamAdvancementDifference;
  }

  const drawWinnerPlayerId = options?.drawWinnerPlayerId ?? null;
  const firstScorerWonDraw = drawWinnerPlayerId != null && firstScorer.player_id == drawWinnerPlayerId;
  const secondScorerWonDraw = drawWinnerPlayerId != null && secondScorer.player_id == drawWinnerPlayerId;

  if (firstScorerWonDraw && !secondScorerWonDraw) {
    return -1;
  }

  if (!firstScorerWonDraw && secondScorerWonDraw) {
    return 1;
  }

  return firstScorer.player_name.localeCompare(secondScorer.player_name, "pt-BR", {
    sensitivity: "base",
  });
}

interface UseChampionshipAwardsRankingsOptions {
  championshipId: string | null;
  seasonYear: number | null;
}

const AWARDS_RANKINGS_REALTIME_DEBOUNCE_MS = 1000;

export function useChampionshipAwardsRankings({ championshipId, seasonYear }: UseChampionshipAwardsRankingsOptions) {
  const [rankings, setRankings] = useState<ChampionshipAwardsRankings | null>(null);
  const [loading, setLoading] = useState(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);
  const fetchRef = useRef<() => Promise<void>>(async () => undefined);

  const fetch = useCallback(async () => {
    if (!championshipId || !seasonYear) {
      setRankings(null);
      return;
    }

    if (isFetchingRef.current) {
      hasQueuedRefetchRef.current = true;
      return;
    }

    isFetchingRef.current = true;
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
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;
        void fetchRef.current();
      }
    }
  }, [championshipId, seasonYear]);

  fetchRef.current = fetch;

  useEffect(() => {
    void fetch();

    if (!championshipId || !seasonYear) return;

    const scheduleFetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        scheduledRefetchTimeoutRef.current = null;
        void fetch();
      }, AWARDS_RANKINGS_REALTIME_DEBOUNCE_MS);
    };

    const championshipSeasonFilter = `championship_id=eq.${championshipId},season_year=eq.${seasonYear}`;

    const channel = supabase
      .channel(`awards-rankings-${championshipId}-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_award_goal_scorers" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_award_draw_results", filter: championshipSeasonFilter }, scheduleFetch)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_competition_team_disqualifications",
          filter: championshipSeasonFilter,
        },
        scheduleFetch,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: championshipSeasonFilter },
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
  }, [championshipId, seasonYear, fetch]);

  return { rankings, loading };
}
