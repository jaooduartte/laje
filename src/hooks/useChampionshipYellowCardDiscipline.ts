import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

export interface YellowCardDisciplineMatch {
  match_id: string;
  match_number: number | null;
  scheduled_date: string | null;
  start_time: string | null;
  phase: string;
  opponent_name: string | null;
  yellow_cards: number;
  red_cards_direct: number;
}

export interface YellowCardDisciplineNextMatch {
  match_id: string;
  scheduled_date: string | null;
  start_time: string | null;
  opponent_name: string | null;
}

export interface YellowCardDisciplineAthlete {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  yellow_cards_total: number;
  yellow_cards_active: number;
  red_cards_direct_total: number;
  is_suspended: boolean;
  suspension_causes: Array<{
    match_id: string;
    direct_red: boolean;
    yellow_accumulation: boolean;
  }>;
  effective_reset_phase: string;
  next_match: YellowCardDisciplineNextMatch | null;
  matches: YellowCardDisciplineMatch[];
}

export interface ChampionshipYellowCardDiscipline {
  season_year: number;
  athletes: YellowCardDisciplineAthlete[];
}

export function useChampionshipYellowCardDiscipline({
  championshipId,
  seasonYear,
}: {
  championshipId: string | null;
  seasonYear: number | null;
}) {
  const [discipline, setDiscipline] =
    useState<ChampionshipYellowCardDiscipline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch = useCallback(async () => {
    if (!championshipId || !seasonYear) {
      setDiscipline(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_championship_yellow_card_discipline", {
        _championship_id: championshipId,
        _season_year: seasonYear,
      });

      if (rpcError) {
        setDiscipline(null);
        setError("Não foi possível carregar os cartões. Tente novamente.");
        return;
      }

      setDiscipline((data as unknown as ChampionshipYellowCardDiscipline) ?? null);
      setError(null);
    } catch {
      setDiscipline(null);
      setError("Não foi possível carregar os cartões. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void fetch();

    if (!championshipId || !seasonYear) {
      return;
    }

    const scheduleFetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        scheduledRefetchTimeoutRef.current = null;
        void fetch();
      }, 180);
    };

    const channel = supabase
      .channel(`yellow-card-discipline-${championshipId}-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_yellow_card_players" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_red_card_players" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `championship_id=eq.${championshipId}` }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_season_settings", filter: `championship_id=eq.${championshipId}` }, scheduleFetch)
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, seasonYear, fetch]);

  return { discipline, loading, error, refetch: fetch };
}
