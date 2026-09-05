import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipBracketPendingTieBreaks } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketTieBreakPendingContext } from "@/domain/championship-brackets/championshipBracket.types";

interface UsePendingTieBreaksOptions {
  championshipId: string | null;
  bracketEditionId?: string | null;
  enabled?: boolean;
}

type PendingTieBreaksFetchResult = Awaited<
  ReturnType<typeof fetchChampionshipBracketPendingTieBreaks>
>;

const pendingTieBreaksRequestByKey = new Map<
  string,
  Promise<PendingTieBreaksFetchResult>
>();
const pendingTieBreaksResultByKey = new Map<
  string,
  { expiresAt: number; result: PendingTieBreaksFetchResult }
>();
const PENDING_TIE_BREAKS_REALTIME_DEBOUNCE_MS = 1000;

function resolvePendingTieBreaksRequestKey(
  championshipId: string,
  bracketEditionId: string,
) {
  return `${championshipId}-${bracketEditionId}`;
}

function fetchSharedPendingTieBreaks(
  championshipId: string,
  bracketEditionId: string,
  forceFresh = false,
) {
  const requestKey = resolvePendingTieBreaksRequestKey(
    championshipId,
    bracketEditionId,
  );
  const currentRequest = pendingTieBreaksRequestByKey.get(requestKey);

  if (currentRequest) {
    return currentRequest;
  }

  const cachedResult = pendingTieBreaksResultByKey.get(requestKey);

  if (!forceFresh && cachedResult && cachedResult.expiresAt > Date.now()) {
    return Promise.resolve(cachedResult.result);
  }

  const request = fetchChampionshipBracketPendingTieBreaks(
    championshipId,
    bracketEditionId,
  )
    .then((result) => {
      if (!result.error) {
        pendingTieBreaksResultByKey.set(requestKey, {
          expiresAt: Date.now() + PENDING_TIE_BREAKS_REALTIME_DEBOUNCE_MS,
          result,
        });
      }

      return result;
    })
    .finally(() => {
      if (pendingTieBreaksRequestByKey.get(requestKey) === request) {
        pendingTieBreaksRequestByKey.delete(requestKey);
      }
    });

  pendingTieBreaksRequestByKey.set(requestKey, request);
  return request;
}

function invalidatePendingTieBreaks(
  championshipId: string,
  bracketEditionId: string,
) {
  pendingTieBreaksResultByKey.delete(
    resolvePendingTieBreaksRequestKey(championshipId, bracketEditionId),
  );
}

export function usePendingTieBreaks({
  championshipId,
  bracketEditionId = null,
  enabled = true,
}: UsePendingTieBreaksOptions) {
  const [pendingContexts, setPendingContexts] = useState<
    ChampionshipBracketTieBreakPendingContext[]
  >([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedPendingTieBreaksRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingPendingTieBreaksRef = useRef(false);
  const hasQueuedPendingTieBreakRefetchRef = useRef(false);
  const shouldForceFreshOnQueuedPendingTieBreakRefetchRef = useRef(false);

  const fetchPendingTieBreaks = useCallback(
    async (shouldShowLoading = false, forceFresh = false) => {
      if (!enabled || !championshipId || !bracketEditionId) {
        setPendingContexts([]);
        setLoading(false);
        hasLoadedPendingTieBreaksRef.current = false;
        isFetchingPendingTieBreaksRef.current = false;
        hasQueuedPendingTieBreakRefetchRef.current = false;
        shouldForceFreshOnQueuedPendingTieBreakRefetchRef.current = false;
        return;
      }

      if (isFetchingPendingTieBreaksRef.current) {
        hasQueuedPendingTieBreakRefetchRef.current = true;
        shouldForceFreshOnQueuedPendingTieBreakRefetchRef.current =
          shouldForceFreshOnQueuedPendingTieBreakRefetchRef.current || forceFresh;
        return;
      }

      isFetchingPendingTieBreaksRef.current = true;

      if (shouldShowLoading || !hasLoadedPendingTieBreaksRef.current) {
        setLoading(true);
      }

      try {
        const response = await fetchSharedPendingTieBreaks(
          championshipId,
          bracketEditionId,
          forceFresh,
        );
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
          const shouldForceFresh =
            shouldForceFreshOnQueuedPendingTieBreakRefetchRef.current;
          shouldForceFreshOnQueuedPendingTieBreakRefetchRef.current = false;
          void fetchPendingTieBreaks(false, shouldForceFresh);
        }
      }
    },
    [bracketEditionId, championshipId, enabled],
  );

  useEffect(() => {
    if (!enabled || !championshipId || !bracketEditionId) {
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
        scheduledRefetchTimeoutRef.current = null;
        invalidatePendingTieBreaks(championshipId, bracketEditionId);
        void fetchPendingTieBreaks(false, true);
      }, PENDING_TIE_BREAKS_REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`pending-tie-breaks-realtime-${championshipId}-${bracketEditionId}`)
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_competitions",
          filter: `bracket_edition_id=eq.${bracketEditionId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_matches",
          filter: `bracket_edition_id=eq.${bracketEditionId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_tie_break_resolutions",
          filter: `bracket_edition_id=eq.${bracketEditionId}`,
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
  }, [bracketEditionId, championshipId, enabled, fetchPendingTieBreaks]);

  const refetch = useCallback(
    () => fetchPendingTieBreaks(true, true),
    [fetchPendingTieBreaks],
  );

  return {
    pendingContexts,
    count: pendingContexts.length,
    loading,
    refetch,
  };
}
