import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/types";
import { MatchStatus } from "@/lib/enums";

interface UseMatchesOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
}

export function useMatches({ championshipId, seasonYear }: UseMatchesOptions = {}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedMatchesRef = useRef(false);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMatches = useCallback(async (shouldShowLoading = false) => {
    if (championshipId === null) {
      setMatches([]);
      setLoading(false);
      hasLoadedMatchesRef.current = false;
      return;
    }

    if (shouldShowLoading || !hasLoadedMatchesRef.current) {
      setLoading(true);
    }

    try {
      let query = supabase
        .from("matches")
        .select(
          "*, championships(*), sports(*), home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)",
        )
        .order("start_time", { ascending: true });

      if (championshipId) {
        query = query.eq("championship_id", championshipId);
      }

      if (typeof seasonYear == "number") {
        query = query.eq("season_year", seasonYear);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao carregar jogos:", error.message);
        setMatches([]);
        return;
      }

      if (data) {
        setMatches(data as unknown as Match[]);
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar jogos:", error);
      setMatches([]);
    } finally {
      hasLoadedMatchesRef.current = true;
      setLoading(false);
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    if (championshipId === null) {
      setMatches([]);
      setLoading(false);
      hasLoadedMatchesRef.current = false;
      return;
    }

    fetchMatches(true);

    const channel = supabase
      .channel(`matches-realtime-${championshipId ?? "all"}-${seasonYear ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: championshipId ? `championship_id=eq.${championshipId}` : undefined,
        },
        () => {
          if (scheduledRefetchTimeoutRef.current) {
            clearTimeout(scheduledRefetchTimeoutRef.current);
          }

          scheduledRefetchTimeoutRef.current = setTimeout(() => {
            fetchMatches();
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
  }, [championshipId, fetchMatches, seasonYear]);

  useEffect(() => {
    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  const liveMatches = matches.filter((match) => match.status === MatchStatus.LIVE);
  const upcomingMatches = matches.filter((match) => match.status === MatchStatus.SCHEDULED);
  const finishedMatches = matches.filter((match) => match.status === MatchStatus.FINISHED);

  return { matches, liveMatches, upcomingMatches, finishedMatches, loading, refetch: fetchMatches };
}
