import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChampionshipAwardType, MatchNaipe, TeamDivision } from "@/lib/enums";

export interface AwardDrawPendingContext {
  context_key: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  award_type: ChampionshipAwardType;
  tied_participants: Array<{
    participant_id: string;
    participant_name: string;
    team_name: string | null;
    metric_value: number;
  }>;
  tied_player_ids_signature: string;
  title: string;
  description: string;
}

interface UsePendingAwardDrawsOptions {
  championshipId: string | null;
  seasonYear: number | null;
}

export function usePendingAwardDraws({ championshipId, seasonYear }: UsePendingAwardDrawsOptions) {
  const [pendingContexts, setPendingContexts] = useState<AwardDrawPendingContext[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);

  const fetchPendingDraws = useCallback(async (shouldShowLoading = false) => {
    if (!championshipId || !seasonYear) {
      setPendingContexts([]);
      setLoading(false);
      hasLoadedRef.current = false;
      isFetchingRef.current = false;
      hasQueuedRefetchRef.current = false;
      return;
    }

    if (isFetchingRef.current) {
      hasQueuedRefetchRef.current = true;
      return;
    }

    isFetchingRef.current = true;

    if (shouldShowLoading || !hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("get_championship_award_pending_draws", {
        _championship_id: championshipId,
        _season_year: seasonYear,
      });

      if (error) {
        console.error("Error fetching pending award draws:", error);
        setPendingContexts([]);
        return;
      }

      const contexts = Array.isArray(data) ? (data as AwardDrawPendingContext[]) : [];
      setPendingContexts(contexts);
    } catch (error) {
      console.error("Error fetching pending award draws:", error);
      setPendingContexts([]);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;
        void fetchPendingDraws();
      }
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    if (!championshipId || !seasonYear) {
      setPendingContexts([]);
      setLoading(false);
      hasLoadedRef.current = false;
      return;
    }

    void fetchPendingDraws(true);

    const scheduleRefetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        void fetchPendingDraws();
      }, 180);
    };

    const channel = supabase
      .channel(`pending-award-draws-realtime-${championshipId}-${seasonYear}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_award_goal_scorers",
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_competition_team_disqualifications",
          filter: `championship_id=eq.${championshipId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_award_draw_results",
          filter: `championship_id=eq.${championshipId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `championship_id=eq.${championshipId}`,
        },
        scheduleRefetch,
      )
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, seasonYear, fetchPendingDraws]);

  return {
    pendingContexts,
    count: pendingContexts.length,
    loading,
    refetch: useCallback(() => fetchPendingDraws(true), [fetchPendingDraws]),
  };
}
