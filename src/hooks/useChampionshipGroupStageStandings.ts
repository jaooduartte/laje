import { useCallback, useEffect, useRef, useState } from "react";
import { fetchChampionshipGroupStageStandings } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipGroupStageStanding } from "@/domain/championship-brackets/championshipBracket.types";

interface UseChampionshipGroupStageStandingsOptions {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
}

export function useChampionshipGroupStageStandings({
  championshipId,
  seasonYear,
  enabled = true,
}: UseChampionshipGroupStageStandingsOptions = {}) {
  const [groupStageStandings, setGroupStageStandings] = useState<ChampionshipGroupStageStanding[]>([]);
  const [loading, setLoading] = useState(() => enabled && championshipId != null);
  const fetchReference = useRef<(showLoading?: boolean) => Promise<void>>(async () => undefined);

  const fetchGroupStageStandings = useCallback(async (showLoading = false) => {
    if (!enabled || !championshipId) {
      setGroupStageStandings([]);
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    }

    try {
      const response = await fetchChampionshipGroupStageStandings(championshipId, seasonYear);
      if (!response.error) {
        setGroupStageStandings(response.data);
      }
    } finally {
      setLoading(false);
    }
  }, [championshipId, enabled, seasonYear]);

  fetchReference.current = fetchGroupStageStandings;

  useEffect(() => {
    void fetchReference.current(true);
  }, [fetchGroupStageStandings]);

  return { groupStageStandings, loading, refetch: fetchGroupStageStandings };
}
