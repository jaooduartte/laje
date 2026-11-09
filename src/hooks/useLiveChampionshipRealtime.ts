import { useAwsRealtimePolling } from "@/hooks/useAwsRealtimePolling";
import { useEffect, useMemo, useRef } from "react";
import { isSupabaseBackendEnabled } from "@/config/environment";
import {
  isDedicatedSportsCoreEnabled,
  listSportsCoreMatches,
} from "@/integrations/laje-api/sports-core";
import { supabase } from "@/integrations/supabase/client";
import { MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

interface LiveMatchRealtimeRow {
  championship_id?: string | null;
  season_year?: number | null;
  status?: MatchStatus | null;
}

interface UseLiveChampionshipRealtimeOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  sportId?: string | null;
  liveMatches?: Match[];
  onLiveMatchesChange: (
    result?: { matches: Match[]; total: number },
    refreshOperationalContext?: boolean,
  ) => void | Promise<void>;
  onUpcomingMatchesChange: () => void | Promise<void>;
  onBracketChange: () => void | Promise<void>;
}

const LIVE_CHAMPIONSHIP_REALTIME_DEBOUNCE_MS = 150;
const LIVE_CHAMPIONSHIP_BRACKET_REFRESH_INTERVAL_MS = 90_000;

interface LiveMatchSnapshot {
  scopeKey: string;
  statusKey: string;
  contentKey: string;
}

function resolveLiveMatchSnapshot(
  matches: Match[],
  championshipId?: string | null,
  seasonYear?: number | null,
  sportId?: string | null,
): LiveMatchSnapshot {
  const orderedMatches = [...matches].sort((firstMatch, secondMatch) =>
    firstMatch.id.localeCompare(secondMatch.id),
  );

  return {
    scopeKey: `${championshipId ?? "all"}:${seasonYear ?? "current"}:${sportId ?? "all"}`,
    statusKey: JSON.stringify(orderedMatches.map((match) => [match.id, match.status])),
    contentKey: JSON.stringify(
      orderedMatches.map((match) => [
        match.id,
        match.status,
        match.division,
        match.naipe,
        match.supports_cards,
        match.sports?.name,
        match.home_team_id,
        match.away_team_id,
        match.home_team?.name,
        match.home_team?.city,
        match.away_team?.name,
        match.away_team?.city,
        match.location,
        match.court_name,
        match.scheduled_date,
        match.scheduled_start_time,
        match.start_time,
        match.end_time,
        match.home_score,
        match.away_score,
        match.current_set_home_score,
        match.current_set_away_score,
        match.home_penalty_score,
        match.away_penalty_score,
        match.home_yellow_cards,
        match.home_red_cards,
        match.home_blue_cards,
        match.home_two_minute_penalties,
        match.away_yellow_cards,
        match.away_red_cards,
        match.away_blue_cards,
        match.away_two_minute_penalties,
        match.is_walkover,
        match.is_double_walkover,
        match.resolved_tie_breaker_rule,
        match.resolved_tie_break_winner_team_id,
        match.match_sets,
      ]),
    ),
  };
}

function isLiveMatchRealtimeRow(value: unknown): value is LiveMatchRealtimeRow {
  return value != null && typeof value == "object";
}

export function useLiveChampionshipRealtime({
  championshipId,
  seasonYear,
  sportId,
  liveMatches = [],
  onLiveMatchesChange,
  onUpcomingMatchesChange,
  onBracketChange,
}: UseLiveChampionshipRealtimeOptions) {
  const callbacksRef = useRef({
    championshipId,
    seasonYear,
    sportId,
    onLiveMatchesChange,
    onUpcomingMatchesChange,
    onBracketChange,
  });

  callbacksRef.current = {
    championshipId,
    seasonYear,
    sportId,
    onLiveMatchesChange,
    onUpcomingMatchesChange,
    onBracketChange,
  };

  const currentSnapshot = useMemo(
    () => resolveLiveMatchSnapshot(liveMatches, championshipId, seasonYear, sportId),
    [liveMatches, championshipId, seasonYear, sportId],
  );
  const { scopeKey, statusKey, contentKey } = currentSnapshot;
  const lastLiveMatchSnapshotRef = useRef(currentSnapshot);

  useEffect(() => {
    lastLiveMatchSnapshotRef.current = {
      scopeKey,
      statusKey,
      contentKey,
    };
  }, [scopeKey, statusKey, contentKey]);

  // LAJE-89: a aba AWS consulta a própria API, sem assinar canais Supabase.
  useAwsRealtimePolling({
    enabled: Boolean(championshipId),
    intervalMs: 30_000,
    onRefresh: async () => {
      const currentCallbacks = callbacksRef.current;

      if (!isDedicatedSportsCoreEnabled() || !currentCallbacks.championshipId) {
        await Promise.all([
          currentCallbacks.onLiveMatchesChange(),
          currentCallbacks.onUpcomingMatchesChange(),
          currentCallbacks.onBracketChange(),
        ]);
        return;
      }

      const liveMatchesResult = await listSportsCoreMatches({
        championshipId: currentCallbacks.championshipId,
        ...(typeof currentCallbacks.seasonYear == "number"
          ? { seasonYear: currentCallbacks.seasonYear }
          : {}),
        ...(currentCallbacks.sportId ? { sportId: currentCallbacks.sportId } : {}),
        statuses: [MatchStatus.LIVE],
        includePendingManualRelocation: false,
        sort: "scheduledDate",
        order: "desc",
      });
      const nextSnapshot = resolveLiveMatchSnapshot(
        liveMatchesResult.matches,
        currentCallbacks.championshipId,
        currentCallbacks.seasonYear,
        currentCallbacks.sportId,
      );
      const previousSnapshot = lastLiveMatchSnapshotRef.current;

      if (previousSnapshot.scopeKey != nextSnapshot.scopeKey) {
        lastLiveMatchSnapshotRef.current = nextSnapshot;
        return;
      }

      lastLiveMatchSnapshotRef.current = nextSnapshot;

      if (previousSnapshot.statusKey != nextSnapshot.statusKey) {
        await Promise.all([
          currentCallbacks.onLiveMatchesChange(liveMatchesResult, true),
          currentCallbacks.onUpcomingMatchesChange(),
          currentCallbacks.onBracketChange(),
        ]);
        return;
      }

      if (previousSnapshot.contentKey != nextSnapshot.contentKey) {
        await currentCallbacks.onLiveMatchesChange(liveMatchesResult, false);
      }
    },
  });

  useAwsRealtimePolling({
    enabled: Boolean(championshipId),
    intervalMs: LIVE_CHAMPIONSHIP_BRACKET_REFRESH_INTERVAL_MS,
    onRefresh: () => callbacksRef.current.onBracketChange(),
  });

  useEffect(() => {
    if (!championshipId || !isSupabaseBackendEnabled()) {
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
          void callbacksRef.current.onLiveMatchesChange();
        }

        if (refreshUpcomingMatches) {
          void callbacksRef.current.onUpcomingMatchesChange();
        }

        if (refreshBracket) {
          void callbacksRef.current.onBracketChange();
        }
      }, LIVE_CHAMPIONSHIP_REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`live-championship-realtime-${championshipId}-${seasonYear ?? "current"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `championship_id=eq.${championshipId}`,
        },
        (payload) => {
          const rows = [payload.new, payload.old].filter(isLiveMatchRealtimeRow);
          const scopedRows = rows.filter((row) => {
            if (row.championship_id != championshipId) {
              return false;
            }

            return typeof seasonYear != "number" || row.season_year == seasonYear;
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

          if (statuses.length == 0 || hasLiveMatch || hasUnknownMatchStatus) {
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

          if (statuses.length == 0 || hasFinishedMatch || hasUnknownMatchStatus) {
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

      void supabase.removeChannel(channel);
    };
  }, [championshipId, seasonYear]);
}
