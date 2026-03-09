import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Standing } from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

interface UseStandingsOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  division?: TeamDivision | null;
  naipe?: MatchNaipe;
}

export function useStandings({ championshipId, seasonYear, division, naipe }: UseStandingsOptions = {}) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStandings = useCallback(async () => {
    if (championshipId === null) {
      setStandings([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let query = supabase
        .from("standings")
        .select("*, championships(*), teams(*), sports(*)")
        .order("points", { ascending: false })
        .order("goal_diff", { ascending: false })
        .order("goals_for", { ascending: false });

      if (championshipId) {
        query = query.eq("championship_id", championshipId);
      }

      if (typeof seasonYear == "number") {
        query = query.eq("season_year", seasonYear);
      }

      if (division === null) {
        query = query.is("division", null);
      } else if (division !== undefined) {
        query = query.eq("division", division);
      }

      if (naipe) {
        query = query.eq("naipe", naipe);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao carregar classificação:", error.message);
        setStandings([]);
        return;
      }

      if (data) {
        setStandings(data as unknown as Standing[]);
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar classificação:", error);
      setStandings([]);
    } finally {
      setLoading(false);
    }
  }, [championshipId, division, naipe, seasonYear]);

  useEffect(() => {
    if (championshipId === null) {
      setStandings([]);
      setLoading(false);
      return;
    }

    fetchStandings();

    const channel = supabase
      .channel(`standings-realtime-${championshipId ?? "all"}-${seasonYear ?? "all"}-${division ?? "any"}-${naipe ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "standings" }, () => {
        fetchStandings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId, division, fetchStandings, naipe, seasonYear]);

  return { standings, loading, refetch: fetchStandings };
}
