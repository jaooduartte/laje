import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipBracketPendingTieBreaks } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketTieBreakPendingContext } from "@/domain/championship-brackets/championshipBracket.types";

interface UsePendingTieBreaksOptions {
  championshipId: string | null;
}

export function usePendingTieBreaks({ championshipId }: UsePendingTieBreaksOptions) {
  const [pendingContexts, setPendingContexts] = useState<ChampionshipBracketTieBreakPendingContext[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedPendingTieBreaksRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingPendingTieBreaksRef = useRef(false);
  const hasQueuedPendingTieBreakRefetchRef = useRef(false);

  const fetchPendingTieBreaks = useCallback(async (shouldShowLoading = false) => {
    if (!championshipId) {
      setPendingContexts([]);
      setLoading(false);
      hasLoadedPendingTieBreaksRef.current = false;
      isFetchingPendingTieBreaksRef.current = false;
      hasQueuedPendingTieBreakRefetchRef.current = false;
      return;
    }

    if (isFetchingPendingTieBreaksRef.current) {
      hasQueuedPendingTieBreakRefetchRef.current = true;
      return;
    }

    isFetchingPendingTieBreaksRef.current = true;

    if (shouldShowLoading || !hasLoadedPendingTieBreaksRef.current) {
      setLoading(true);
    }

    try {
      const response = await fetchChampionshipBracketPendingTieBreaks(championshipId);
      setPendingContexts(response.data);
    } catch (error) {
      console.error("Error fetching pending tie breaks:", error);
      setPendingContexts([]);
    } finally {
      hasLoadedPendingTieBreaksRef.current = true;
      setLoading(false);
      isFetchingPendingTieBreaksRef.current = false;

      if (hasQueuedPendingTieBreakRefetchRef.current) {
        hasQueuedPendingTieBreakRefetchRef.current = false;
        void fetchPendingTieBreaks();
      }
    }
  }, [championshipId]);

  useEffect(() => {
    if (!championshipId) {
      setPendingContexts([]);
      setLoading(false);
      hasLoadedPendingTieBreaksRef.current = false;
      return;
    }

    void fetchPendingTieBreaks(true);

    const scheduleRefetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        void fetchPendingTieBreaks();
      }, 180);
    };

    const channel = supabase
      .channel(`pending-tie-breaks-realtime-${championshipId}`)
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_editions",
          filter: `championship_id=eq.${championshipId}`,
        },
        scheduleRefetch,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_competitions" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_groups" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_matches" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_tie_break_resolutions" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_tie_break_resolution_teams" }, scheduleRefetch)
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, fetchPendingTieBreaks]);

  return {
    pendingContexts,
    count: pendingContexts.length,
    loading,
    refetch: useCallback(() => fetchPendingTieBreaks(true), [fetchPendingTieBreaks]),
  };
}
