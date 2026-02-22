import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/types";
import { MatchStatus } from "@/lib/enums";

interface UseMatchesOptions {
  championshipId?: string | null;
}

export function useMatches({ championshipId }: UseMatchesOptions = {}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMatches = async () => {
    if (championshipId === null) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);

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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (championshipId === null) {
      setMatches([]);
      setLoading(false);
      return;
    }

    fetchMatches();

    const channel = supabase
      .channel(`matches-realtime-${championshipId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        fetchMatches();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId]);

  const liveMatches = matches.filter((match) => match.status === MatchStatus.LIVE);
  const upcomingMatches = matches.filter((match) => match.status === MatchStatus.SCHEDULED);
  const finishedMatches = matches.filter((match) => match.status === MatchStatus.FINISHED);

  return { matches, liveMatches, upcomingMatches, finishedMatches, loading, refetch: fetchMatches };
}
