import { useCallback, useEffect, useState } from "react";
import {
  fetchInterlajeOverallStandings,
  type InterlajeOverallStanding,
} from "@/domain/interlaje/interlajeOverallStandings.repository";

export function useInterlajeOverallStandings({
  championshipId,
  seasonYear,
  enabled = true,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
}) {
  const [standings, setStandings] = useState<InterlajeOverallStanding[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled || !championshipId || !seasonYear) {
      setStandings([]);
      return;
    }

    setLoading(true);
    const response = await fetchInterlajeOverallStandings(championshipId, seasonYear);
    setStandings(response.data);
    setLoading(false);
  }, [championshipId, enabled, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { standings, loading, refetch };
}
