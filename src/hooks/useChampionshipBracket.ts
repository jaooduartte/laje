import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_CHAMPIONSHIP_BRACKET_VIEW } from "@/lib/championship";
import { fetchChampionshipBracketView } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketView } from "@/lib/types";

interface UseChampionshipBracketOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
}

interface ChampionshipScopedRealtimeRow {
  championship_id?: string | null;
  season_year?: number | null;
}

type ChampionshipBracketFetchResult = Awaited<
  ReturnType<typeof fetchChampionshipBracketView>
>;

const championshipBracketRequestByKey = new Map<
  string,
  Promise<ChampionshipBracketFetchResult>
>();

function resolveChampionshipBracketRequestKey(
  championshipId: string,
  seasonYear?: number | null,
) {
  return `${championshipId}-${seasonYear ?? "current"}`;
}

function fetchSharedChampionshipBracketView(
  championshipId: string,
  seasonYear?: number | null,
) {
  const requestKey = resolveChampionshipBracketRequestKey(
    championshipId,
    seasonYear,
  );
  const currentRequest = championshipBracketRequestByKey.get(requestKey);

  if (currentRequest) {
    return currentRequest;
  }

  const request = fetchChampionshipBracketView(championshipId, seasonYear).finally(
    () => {
      if (championshipBracketRequestByKey.get(requestKey) === request) {
        championshipBracketRequestByKey.delete(requestKey);
      }
    },
  );

  championshipBracketRequestByKey.set(requestKey, request);
  return request;
}

function isChampionshipScopedRealtimeRow(
  value: unknown,
): value is ChampionshipScopedRealtimeRow {
  return value != null && typeof value == "object";
}

export function useChampionshipBracket({
  championshipId,
  seasonYear,
  enabled = true,
}: UseChampionshipBracketOptions = {}) {
  const [championshipBracketView, setChampionshipBracketView] =
    useState<ChampionshipBracketView>(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
  const [loading, setLoading] = useState(true);
  const hasLoadedBracketRef = useRef(false);
  const isFetchingBracketRef = useRef(false);
  const hasQueuedBracketRefetchRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const fetchBracket = useCallback(
    async (shouldShowLoading = false) => {
      if (!enabled) {
        setLoading(true);
        hasLoadedBracketRef.current = false;
        isFetchingBracketRef.current = false;
        hasQueuedBracketRefetchRef.current = false;
        return;
      }

      if (!championshipId) {
        setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
        setLoading(false);
        hasLoadedBracketRef.current = false;
        isFetchingBracketRef.current = false;
        hasQueuedBracketRefetchRef.current = false;
        return;
      }

      if (isFetchingBracketRef.current) {
        hasQueuedBracketRefetchRef.current = true;
        return;
      }

      isFetchingBracketRef.current = true;

      if (shouldShowLoading || !hasLoadedBracketRef.current) {
        setLoading(true);
      }

      try {
        const { data, error } = await fetchSharedChampionshipBracketView(
          championshipId,
          seasonYear,
        );

        if (error || !data) {
          setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
          return;
        }

        setChampionshipBracketView(data);
      } finally {
        hasLoadedBracketRef.current = true;
        setLoading(false);
        isFetchingBracketRef.current = false;

        if (hasQueuedBracketRefetchRef.current) {
          hasQueuedBracketRefetchRef.current = false;
          void fetchBracket();
        }
      }
    },
    [championshipId, enabled, seasonYear],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      hasLoadedBracketRef.current = false;
      return;
    }

    if (!championshipId) {
      setChampionshipBracketView(EMPTY_CHAMPIONSHIP_BRACKET_VIEW);
      setLoading(false);
      hasLoadedBracketRef.current = false;
      return;
    }

    fetchBracket(true);

    const channel = supabase
      .channel(
        `championship-bracket-realtime-${championshipId}-${seasonYear ?? "current"}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `championship_id=eq.${championshipId}`,
        },
        (payload) => {
          const relevantRows = [payload.new, payload.old].filter(
            isChampionshipScopedRealtimeRow,
          );
          const shouldRefetch =
            relevantRows.length == 0 ||
            relevantRows.some((row) => {
              if (row.championship_id != championshipId) {
                return false;
              }

              if (
                typeof seasonYear == "number" &&
                row.season_year != seasonYear
              ) {
                return false;
              }

              return true;
            });

          if (!shouldRefetch) {
            return;
          }

          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracket();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "championship_bracket_matches" },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracket();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "championship_bracket_groups" },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracket();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_competitions",
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracket();
          }, 120);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "championship_bracket_editions",
          filter: `championship_id=eq.${championshipId}`,
        },
        (payload) => {
          const relevantRows = [payload.new, payload.old].filter(
            isChampionshipScopedRealtimeRow,
          );
          const shouldRefetch =
            relevantRows.length == 0 ||
            relevantRows.some((row) => {
              if (row.championship_id != championshipId) {
                return false;
              }

              if (
                typeof seasonYear == "number" &&
                row.season_year != seasonYear
              ) {
                return false;
              }

              return true;
            });

          if (!shouldRefetch) {
            return;
          }

          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchBracket();
          }, 120);
        },
      )
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, enabled, fetchBracket, seasonYear]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    championshipBracketView,
    loading,
    refetch: fetchBracket,
  };
}
