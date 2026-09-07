import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipCorrectedGroupStandings } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipCorrectedGroupStanding } from "@/domain/championship-brackets/championshipBracket.types";

interface UseChampionshipCorrectedGroupStandingsOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
}

const CORRECTED_GROUP_STANDINGS_REALTIME_DEBOUNCE_MS = 1000;
const PUBLIC_CORRECTED_STANDINGS_POLL_MIN_MS = 30000;
const PUBLIC_CORRECTED_STANDINGS_POLL_JITTER_MS = 15000;

function isPublicChampionshipsPage() {
  return (
    typeof window != "undefined" &&
    window.location.pathname.startsWith("/campeonatos")
  );
}

function resolvePublicPollDelay() {
  return (
    PUBLIC_CORRECTED_STANDINGS_POLL_MIN_MS +
    Math.floor(Math.random() * PUBLIC_CORRECTED_STANDINGS_POLL_JITTER_MS)
  );
}

export function useChampionshipCorrectedGroupStandings({
  championshipId,
  seasonYear,
  enabled = true,
}: UseChampionshipCorrectedGroupStandingsOptions = {}) {
  const [correctedGroupStandings, setCorrectedGroupStandings] = useState<ChampionshipCorrectedGroupStanding[]>([]);
  const [loading, setLoading] = useState(() => enabled && championshipId != null);
  const hasLoadedCorrectedStandingsRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);
  const fetchCorrectedGroupStandingsRef = useRef<(shouldShowLoading?: boolean) => Promise<void>>(
    async () => undefined,
  );

  const fetchCorrectedGroupStandings = useCallback(async (shouldShowLoading = false) => {
    if (!enabled || !championshipId) {
      setCorrectedGroupStandings([]);
      setLoading(false);
      hasLoadedCorrectedStandingsRef.current = false;
      return;
    }

    if (isFetchingRef.current) {
      hasQueuedRefetchRef.current = true;
      return;
    }

    isFetchingRef.current = true;

    if (shouldShowLoading || !hasLoadedCorrectedStandingsRef.current) {
      setLoading(true);
    }

    try {
      const response = await fetchChampionshipCorrectedGroupStandings(championshipId, seasonYear ?? null);

      if (response.error) {
        return;
      }

      setCorrectedGroupStandings(response.data);
    } finally {
      setLoading(false);
      hasLoadedCorrectedStandingsRef.current = true;
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;
        void fetchCorrectedGroupStandingsRef.current();
      }
    }
  }, [championshipId, enabled, seasonYear]);

  fetchCorrectedGroupStandingsRef.current = fetchCorrectedGroupStandings;

  useEffect(() => {
    if (!enabled || !championshipId) {
      setCorrectedGroupStandings([]);
      setLoading(false);
      hasLoadedCorrectedStandingsRef.current = false;
      return;
    }

    void fetchCorrectedGroupStandings(true);

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
              void fetchCorrectedGroupStandings();
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
        void fetchCorrectedGroupStandings();
      }, CORRECTED_GROUP_STANDINGS_REALTIME_DEBOUNCE_MS);
    };

    const standingsFilter = [
      `championship_id=eq.${championshipId}`,
      typeof seasonYear == "number" ? `season_year=eq.${seasonYear}` : null,
    ].filter((value): value is string => value != null).join(",");

    const channel = supabase
      .channel(`championship-corrected-standings-${championshipId}-${seasonYear ?? "current"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "standings", filter: standingsFilter }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_groups" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_group_teams" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_bracket_competitions" }, scheduleFetch)
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, enabled, fetchCorrectedGroupStandings, seasonYear]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    correctedGroupStandings,
    loading,
    refetch: fetchCorrectedGroupStandings,
  };
}
