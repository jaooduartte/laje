import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MatchStatus } from "@/lib/enums";

interface LiveMatchRealtimeRow {
  championship_id?: string | null;
  season_year?: number | null;
  status?: MatchStatus | null;
}

interface UseLiveChampionshipRealtimeOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  onLiveMatchesChange: () => void;
  onUpcomingMatchesChange: () => void;
  onBracketChange: () => void;
}

const LIVE_CHAMPIONSHIP_REALTIME_DEBOUNCE_MS = 150;

function isLiveMatchRealtimeRow(value: unknown): value is LiveMatchRealtimeRow {
  return value != null && typeof value == "object";
}

export function useLiveChampionshipRealtime({
  championshipId,
  seasonYear,
  onLiveMatchesChange,
  onUpcomingMatchesChange,
  onBracketChange,
}: UseLiveChampionshipRealtimeOptions) {
  const callbacksRef = useRef({
    onLiveMatchesChange,
    onUpcomingMatchesChange,
    onBracketChange,
  });

  callbacksRef.current = {
    onLiveMatchesChange,
    onUpcomingMatchesChange,
    onBracketChange,
  };

  useEffect(() => {
    if (!championshipId) {
      return;
    }

    let scheduledRefetchTimeout: ReturnType<typeof setTimeout> | null = null;
    let shouldRefreshLiveMatches = false;
    let shouldRefreshUpcomingMatches = false;
    let shouldRefreshBracket = false;

    const scheduleRefresh = () => {
      if (scheduledRefetchTimeout) {
        clearTimeout(scheduledRefetchTimeout);
      }

      scheduledRefetchTimeout = setTimeout(() => {
        const refreshLiveMatches = shouldRefreshLiveMatches;
        const refreshUpcomingMatches = shouldRefreshUpcomingMatches;
        const refreshBracket = shouldRefreshBracket;

        shouldRefreshLiveMatches = false;
        shouldRefreshUpcomingMatches = false;
        shouldRefreshBracket = false;
        scheduledRefetchTimeout = null;

        if (refreshLiveMatches) {
          callbacksRef.current.onLiveMatchesChange();
        }

        if (refreshUpcomingMatches) {
          callbacksRef.current.onUpcomingMatchesChange();
        }

        if (refreshBracket) {
          callbacksRef.current.onBracketChange();
        }
      }, LIVE_CHAMPIONSHIP_REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(
        `live-championship-realtime-${championshipId}-${seasonYear ?? "current"}`,
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
          const rows = [payload.new, payload.old].filter(
            isLiveMatchRealtimeRow,
          );
          const scopedRows = rows.filter((row) => {
            if (row.championship_id != championshipId) {
              return false;
            }

            return (
              typeof seasonYear != "number" || row.season_year == seasonYear
            );
          });

          if (rows.length > 0 && scopedRows.length == 0) {
            return;
          }

          const statuses = scopedRows.map((row) => row.status);
          const hasLiveMatch = statuses.includes(MatchStatus.LIVE);
          const hasScheduledMatch = statuses.includes(MatchStatus.SCHEDULED);
          const hasFinishedMatch = statuses.includes(MatchStatus.FINISHED);
          const hasUnknownMatchStatus = statuses.some(
            (status) =>
              status != MatchStatus.LIVE &&
              status != MatchStatus.SCHEDULED &&
              status != MatchStatus.FINISHED,
          );

          if (
            statuses.length == 0 ||
            hasLiveMatch ||
            hasUnknownMatchStatus
          ) {
            shouldRefreshLiveMatches = true;
          }

          if (
            statuses.length == 0 ||
            hasScheduledMatch ||
            (hasLiveMatch && hasFinishedMatch) ||
            hasUnknownMatchStatus
          ) {
            shouldRefreshUpcomingMatches = true;
          }

          if (
            statuses.length == 0 ||
            hasFinishedMatch ||
            hasUnknownMatchStatus
          ) {
            shouldRefreshBracket = true;
          }

          scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      if (scheduledRefetchTimeout) {
        clearTimeout(scheduledRefetchTimeout);
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, seasonYear]);
}
