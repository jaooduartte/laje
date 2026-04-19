import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchChampionshipCorrectedGroupStandings } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipCorrectedGroupStanding } from "@/domain/championship-brackets/championshipBracket.types";

interface UseChampionshipCorrectedGroupStandingsOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
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

  const fetchCorrectedGroupStandings = useCallback(async (shouldShowLoading = false) => {
    if (!enabled || !championshipId) {
      setCorrectedGroupStandings([]);
      setLoading(false);
      hasLoadedCorrectedStandingsRef.current = false;
      return;
    }

    if (shouldShowLoading || !hasLoadedCorrectedStandingsRef.current) {
      setLoading(true);
    }

    const response = await fetchChampionshipCorrectedGroupStandings(championshipId, seasonYear ?? null);

    if (response.error) {
      setCorrectedGroupStandings([]);
      setLoading(false);
      hasLoadedCorrectedStandingsRef.current = true;
      return;
    }

    setCorrectedGroupStandings(response.data);
    setLoading(false);
    hasLoadedCorrectedStandingsRef.current = true;
  }, [championshipId, enabled, seasonYear]);

  useEffect(() => {
    if (!enabled || !championshipId) {
      setCorrectedGroupStandings([]);
      setLoading(false);
      hasLoadedCorrectedStandingsRef.current = false;
      return;
    }

    void fetchCorrectedGroupStandings(true);

    const scheduleFetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        void fetchCorrectedGroupStandings();
      }, 120);
    };

    const channel = supabase
      .channel(`championship-corrected-standings-${championshipId}-${seasonYear ?? "current"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "standings" }, scheduleFetch)
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
