import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipBracketResolvedTieBreakOrders } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketResolvedTieBreakOrderContext } from "@/domain/championship-brackets/championshipBracket.types";

interface UseChampionshipBracketResolvedTieBreakOrdersOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
}

const RESOLVED_TIE_BREAK_REALTIME_DEBOUNCE_MS = 1000;
const PUBLIC_RESOLVED_TIE_BREAK_POLL_MIN_MS = 60000;
const PUBLIC_RESOLVED_TIE_BREAK_POLL_JITTER_MS = 30000;
const RESOLVED_TIE_BREAK_REQUEST_TIMEOUT_MS = 8000;

function isPublicChampionshipsPage() {
  return (
    typeof window != "undefined" &&
    window.location.pathname.startsWith("/campeonatos")
  );
}

function resolvePublicPollDelay() {
  return (
    PUBLIC_RESOLVED_TIE_BREAK_POLL_MIN_MS +
    Math.floor(Math.random() * PUBLIC_RESOLVED_TIE_BREAK_POLL_JITTER_MS)
  );
}

function withRequestTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Supabase request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
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
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);
  const fetchRef = useRef<(shouldShowLoading?: boolean) => Promise<void>>(async () => undefined);

  const fetchResolvedTieBreakOrders = useCallback(async (shouldShowLoading = false) => {
    if (!enabled || !championshipId) {
      setResolvedTieBreakOrders([]);
      setLoading(false);
      hasLoadedResolvedTieBreakOrdersRef.current = false;
      isFetchingRef.current = false;
      hasQueuedRefetchRef.current = false;
      return;
    }

    if (isFetchingRef.current) {
      hasQueuedRefetchRef.current = true;
      return;
    }

    isFetchingRef.current = true;

    if (shouldShowLoading || !hasLoadedResolvedTieBreakOrdersRef.current) {
      setLoading(true);
    }

    try {
      const response = await withRequestTimeout(
        fetchChampionshipBracketResolvedTieBreakOrders(
          championshipId,
          seasonYear ?? null,
        ),
        RESOLVED_TIE_BREAK_REQUEST_TIMEOUT_MS,
      );

      if (!response.error) {
        setResolvedTieBreakOrders(response.data);
      }
    } catch (error) {
      // Keep the last successful value during transient PostgREST/database
      // degradation instead of replacing usable public data with an empty state.
      console.warn("Unable to refresh resolved tie-break orders:", error);
    } finally {
      hasLoadedResolvedTieBreakOrdersRef.current = true;
      setLoading(false);
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;
        void fetchRef.current();
      }
    }
  }, [championshipId, enabled, seasonYear]);

  fetchRef.current = fetchResolvedTieBreakOrders;

  useEffect(() => {
    if (!enabled || !championshipId) {
      setResolvedTieBreakOrders([]);
      setLoading(false);
      hasLoadedResolvedTieBreakOrdersRef.current = false;
      return;
    }

    void fetchResolvedTieBreakOrders(true);

    if (isPublicChampionshipsPage()) {
      let cancelled = false;

      const scheduleNextPoll = () => {
        scheduledRefetchTimeoutRef.current = setTimeout(() => {
          scheduledRefetchTimeoutRef.current = null;

          if (!cancelled) {
            if (
              typeof document == "undefined" ||
              document.visibilityState == "visible"
            ) {
              void fetchResolvedTieBreakOrders();
            }

            scheduleNextPoll();
          }
        }, resolvePublicPollDelay());
      };

      scheduleNextPoll();

      return () => {
        cancelled = true;
        if (scheduledRefetchTimeoutRef.current) {
          clearTimeout(scheduledRefetchTimeoutRef.current);
          scheduledRefetchTimeoutRef.current = null;
        }
      };
    }

    const scheduleFetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        scheduledRefetchTimeoutRef.current = null;
        void fetchResolvedTieBreakOrders();
      }, RESOLVED_TIE_BREAK_REALTIME_DEBOUNCE_MS);
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
