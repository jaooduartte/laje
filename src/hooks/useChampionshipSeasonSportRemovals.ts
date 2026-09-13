import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type SupabaseSeasonSportRemovalsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => Promise<{
          data: Array<{ sport_id: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

const supabaseSeasonSportRemovalsClient =
  supabase as unknown as SupabaseSeasonSportRemovalsClient;

export function useChampionshipSeasonSportRemovals({
  championshipId,
  seasonYear,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
}) {
  const [removedSportIds, setRemovedSportIds] = useState<string[]>([]);

  const refetch = useCallback(async () => {
    if (!championshipId || seasonYear == null) {
      setRemovedSportIds([]);
      return;
    }

    const { data, error } = await supabaseSeasonSportRemovalsClient
      .from("championship_season_sport_removals")
      .select("sport_id")
      .eq("championship_id", championshipId)
      .eq("season_year", seasonYear);

    if (error) {
      console.error("Erro ao carregar modalidades removidas da temporada:", error.message);
      return;
    }

    setRemovedSportIds(data?.map((removal) => removal.sport_id) ?? []);
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { removedSportIds, refetch };
}
