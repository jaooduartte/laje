import { useCallback, useEffect, useState } from "react";
import {
  fetchInterlajeOverallStandings,
  type InterlajeOverallStanding,
} from "@/domain/interlaje/interlajeOverallStandings.repository";

export function useInterlajeOverallStandings({
  championshipId,
  seasonYear,
  enabled = true,
  refreshKey,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
  refreshKey?: number;
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
  }, [refetch, refreshKey]);

  return { standings, loading, refetch };
}
