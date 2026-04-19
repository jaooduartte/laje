import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipBracketResolvedTieBreakOrders } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketResolvedTieBreakOrderContext } from "@/domain/championship-brackets/championshipBracket.types";

interface UseChampionshipBracketResolvedTieBreakOrdersOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
}

export function useChampionshipBracketResolvedTieBreakOrders({
  championshipId,
  seasonYear,
  enabled = true,
}: UseChampionshipBracketResolvedTieBreakOrdersOptions = {}) {
  const [resolvedTieBreakOrders, setResolvedTieBreakOrders] = useState<ChampionshipBracketResolvedTieBreakOrderContext[]>([]);
  const [loading, setLoading] = useState(() => enabled && championshipId != null);
  const hasLoadedResolvedTieBreakOrdersRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResolvedTieBreakOrders = useCallback(async (shouldShowLoading = false) => {
    if (!enabled || !championshipId) {
      setResolvedTieBreakOrders([]);
      setLoading(false);
      hasLoadedResolvedTieBreakOrdersRef.current = false;
      return;
    }

    if (shouldShowLoading || !hasLoadedResolvedTieBreakOrdersRef.current) {
      setLoading(true);
    }

    const response = await fetchChampionshipBracketResolvedTieBreakOrders(championshipId, seasonYear ?? null);

    if (response.error) {
      setResolvedTieBreakOrders([]);
      setLoading(false);
      hasLoadedResolvedTieBreakOrdersRef.current = true;
      return;
    }

    setResolvedTieBreakOrders(response.data);
    setLoading(false);
    hasLoadedResolvedTieBreakOrdersRef.current = true;
  }, [championshipId, enabled, seasonYear]);

  useEffect(() => {
    if (!enabled || !championshipId) {
      setResolvedTieBreakOrders([]);
      setLoading(false);
      hasLoadedResolvedTieBreakOrdersRef.current = false;
      return;
    }

    void fetchResolvedTieBreakOrders(true);

    const scheduleFetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        void fetchResolvedTieBreakOrders();
      }, 120);
    };

    const channel = supabase
      .channel(`championship-resolved-tie-break-orders-${championshipId}-${seasonYear ?? "current"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_tie_break_resolutions" }, scheduleFetch)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "championship_bracket_tie_break_resolution_teams" },
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
  }, [championshipId, enabled, fetchResolvedTieBreakOrders, seasonYear]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    resolvedTieBreakOrders,
    loading,
    refetch: fetchResolvedTieBreakOrders,
  };
}
