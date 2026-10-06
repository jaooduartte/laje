import { useEffect, useState } from "react";
import { isSupabaseBackendEnabled } from "@/config/environment";
import {
  isDedicatedSportsCoreEnabled,
  listSportsCoreChampionships,
} from "@/integrations/laje-api/sports-core";
import { supabase } from "@/integrations/supabase/client";
import { ChampionshipCode } from "@/lib/enums";
import type { Championship } from "@/lib/types";

const CHAMPIONSHIP_SORT_ORDER: Record<ChampionshipCode, number> = {
  [ChampionshipCode.CLV]: 0,
  [ChampionshipCode.SOCIETY]: 1,
  [ChampionshipCode.INTERLAJE]: 2,
};

function orderChampionships(championships: Championship[]): Championship[] {
  return championships.slice().sort((firstChampionship, secondChampionship) => {
    return (
      CHAMPIONSHIP_SORT_ORDER[firstChampionship.code] -
      CHAMPIONSHIP_SORT_ORDER[secondChampionship.code]
    );
  });
}

export function useChampionships({ realtimeEnabled = true }: { realtimeEnabled?: boolean } = {}) {
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChampionships = async () => {
    setLoading(true);

    try {
      if (isDedicatedSportsCoreEnabled()) {
        const data = await listSportsCoreChampionships();
        setChampionships(orderChampionships(data));
        return;
      }

      const { data, error } = await supabase.from("championships").select("*");

      if (error) {
        console.error("Erro ao carregar campeonatos:", error.message);
        setChampionships([]);
        return;
      }

      setChampionships(orderChampionships((data ?? []) as Championship[]));
    } catch (error) {
      console.error("Erro inesperado ao carregar campeonatos:", error);
      setChampionships([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchChampionships();

    if (!realtimeEnabled || !isSupabaseBackendEnabled()) {
      return;
    }

    // LAJE-89 migrará o transporte realtime. Até lá, o canal Supabase é apenas
    // um sinal de invalidação; os dados são relidos da laje-api quando configurada.
    const channel = supabase
      .channel("championships-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "championships" }, () => {
        void fetchChampionships();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtimeEnabled]);

  return { championships, loading, refetch: fetchChampionships };
}
