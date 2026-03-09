import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Championship } from "@/lib/types";
import { ChampionshipCode } from "@/lib/enums";

const CHAMPIONSHIP_SORT_ORDER: Record<ChampionshipCode, number> = {
  [ChampionshipCode.CLV]: 0,
  [ChampionshipCode.SOCIETY]: 1,
  [ChampionshipCode.INTERLAJE]: 2,
};

export function useChampionships() {
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChampionships = async () => {
    setLoading(true);

    try {
      const { error: syncError } = await supabase.rpc("sync_championship_season_rollover");

      if (syncError) {
        console.error("Erro ao sincronizar virada de temporada:", syncError.message);
      }

      const { data, error } = await supabase.from("championships").select("*");

      if (error) {
        console.error("Erro ao carregar campeonatos:", error.message);
        setChampionships([]);
        return;
      }

      if (data) {
        const ordered = (data as Championship[]).sort((firstChampionship, secondChampionship) => {
          return CHAMPIONSHIP_SORT_ORDER[firstChampionship.code] - CHAMPIONSHIP_SORT_ORDER[secondChampionship.code];
        });
        setChampionships(ordered);
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar campeonatos:", error);
      setChampionships([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChampionships();

    const channel = supabase
      .channel("championships-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "championships" }, () => {
        fetchChampionships();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { championships, loading, refetch: fetchChampionships };
}
