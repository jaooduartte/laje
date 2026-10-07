import { useCallback, useEffect, useRef, useState } from "react";
import { isAwsBackendEnabled, isSupabaseBackendEnabled } from "@/config/environment";
import { listSportsCoreMatches } from "@/integrations/laje-api/sports-core";
import { supabase } from "@/integrations/supabase/client";
import { MatchStatus } from "@/lib/enums";

interface UsePendingScoreSheetReviewCountOptions {
  championshipId: string | null;
  seasonYear: number | null;
}

export function usePendingScoreSheetReviewCount({
  championshipId,
  seasonYear,
}: UsePendingScoreSheetReviewCountOptions) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isFetchingCountRef = useRef(false);
  const hasQueuedCountRefetchRef = useRef(false);

  const fetchCount = useCallback(async () => {
    if (!championshipId || seasonYear == null) {
      setCount(0);
      setLoading(false);
      isFetchingCountRef.current = false;
      hasQueuedCountRefetchRef.current = false;
      return;
    }

    if (isFetchingCountRef.current) {
      hasQueuedCountRefetchRef.current = true;
      return;
    }

    isFetchingCountRef.current = true;

    setLoading(true);

    try {
      if (isAwsBackendEnabled()) {
        const { matches } = await listSportsCoreMatches({
          championshipId,
          seasonYear,
          statuses: [MatchStatus.FINISHED],
        });
        setCount(matches.filter((match) => match.is_score_sheet_reviewed !== true).length);
        return;
      }

      if (!isSupabaseBackendEnabled()) {
        setCount(0);
        return;
      }

      const { count: nextCount, error } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("championship_id", championshipId)
        .eq("season_year", seasonYear)
        .eq("status", MatchStatus.FINISHED)
        .or("is_score_sheet_reviewed.eq.false,is_score_sheet_reviewed.is.null");

      if (error) {
        console.error("Erro ao carregar pendências da conferência de súmula:", error.message);
        setCount(0);
        return;
      }

      setCount(nextCount ?? 0);
    } catch (error) {
      console.error("Erro ao carregar pendências da conferência de súmula:", error);
      setCount(0);
    } finally {
      setLoading(false);
      isFetchingCountRef.current = false;

      if (hasQueuedCountRefetchRef.current) {
        hasQueuedCountRefetchRef.current = false;
        void fetchCount();
      }
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void fetchCount();

    if (!isSupabaseBackendEnabled() || !championshipId) {
      return;
    }

    const channel = supabase
      .channel(`pending-score-sheet-review-count-${championshipId}-${seasonYear ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `championship_id=eq.${championshipId}`,
        },
        () => {
          void fetchCount();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId, fetchCount, seasonYear]);

  return {
    count,
    loading,
    refetch: fetchCount,
  };
}
