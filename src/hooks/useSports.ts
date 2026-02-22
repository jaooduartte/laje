import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipSport, Sport } from "@/lib/types";

interface UseSportsOptions {
  championshipId?: string | null;
}

export function useSports({ championshipId }: UseSportsOptions = {}) {
  const [sports, setSports] = useState<Sport[]>([]);
  const [championshipSports, setChampionshipSports] = useState<ChampionshipSport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSports = async () => {
    if (championshipId === null) {
      setSports([]);
      setChampionshipSports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (!championshipId) {
        const { data, error } = await supabase.from("sports").select("*").order("name");

        if (error) {
          console.error("Erro ao carregar modalidades:", error.message);
          setSports([]);
          setChampionshipSports([]);
          return;
        }

        if (data) {
          setSports(data as Sport[]);
          setChampionshipSports([]);
        }

        return;
      }

      const { data, error } = await supabase
        .from("championship_sports")
        .select("*, sports(*)")
        .eq("championship_id", championshipId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Erro ao carregar modalidades do campeonato:", error.message);
        setSports([]);
        setChampionshipSports([]);
        return;
      }

      if (data) {
        const mappedChampionshipSports = data as unknown as ChampionshipSport[];
        const uniqueSportsById = new Map<string, Sport>();

        mappedChampionshipSports.forEach((championshipSport) => {
          const sport = championshipSport.sports;

          if (sport && !uniqueSportsById.has(sport.id)) {
            uniqueSportsById.set(sport.id, sport);
          }
        });

        setChampionshipSports(mappedChampionshipSports);
        setSports([...uniqueSportsById.values()]);
      }
    } catch (error) {
      console.error("Erro inesperado ao carregar modalidades:", error);
      setSports([]);
      setChampionshipSports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (championshipId === null) {
      setSports([]);
      setChampionshipSports([]);
      setLoading(false);
      return;
    }

    fetchSports();

    const channel = supabase
      .channel(`sports-realtime-${championshipId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sports" }, () => {
        fetchSports();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_sports" }, () => {
        fetchSports();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId]);

  return { sports, championshipSports, loading, refetch: fetchSports };
}
