import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Standing } from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

interface UseStandingsOptions {
  championshipId?: string | null;
  division?: TeamDivision | null;
  naipe?: MatchNaipe;
}

export function useStandings({ championshipId, division, naipe }: UseStandingsOptions = {}) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStandings = async () => {
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
  };

  useEffect(() => {
    if (championshipId === null) {
      setStandings([]);
      setLoading(false);
      return;
    }

    fetchStandings();

    const channel = supabase
      .channel(`standings-realtime-${championshipId ?? "all"}-${division ?? "any"}-${naipe ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "standings" }, () => {
        fetchStandings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId, division, naipe]);

  return { standings, loading, refetch: fetchStandings };
}
