import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OperationalQueueItem = {
  item_type: "MATCH" | "INDIVIDUAL_SESSION";
  item_id: string;
};

type SupabaseLooseClient = {
  rpc: (
    functionName: string,
    argumentsValue: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

const supabaseLoose = supabase as unknown as SupabaseLooseClient;

function preserveEqualIds(currentIds: string[], nextIds: string[]) {
  return currentIds.length == nextIds.length &&
    currentIds.every((currentId, index) => currentId == nextIds[index])
    ? currentIds
    : nextIds;
}

export function useChampionshipControlOperationalQueue({
  championshipId,
  seasonYear,
  enabled = true,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  enabled?: boolean;
}) {
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [individualSessionIds, setIndividualSessionIds] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  const refetch = useCallback(
    async ({ showFetching = false }: { showFetching?: boolean } = {}) => {
      if (!enabled || !championshipId || typeof seasonYear != "number") {
        setMatchIds([]);
        setIndividualSessionIds([]);
        setLoading(false);
        setIsFetching(false);
        return;
      }

      if (showFetching) {
        setIsFetching(true);
      } else {
        setLoading(true);
      }

      const { data, error } = await supabaseLoose.rpc(
        "get_championship_control_operational_queue",
        {
          _championship_id: championshipId,
          _season_year: seasonYear,
        },
      );

      if (error) {
        console.error("Erro ao carregar fila operacional do controle:", error.message);
        setMatchIds([]);
        setIndividualSessionIds([]);
      } else {
        const queueItems = (data ?? []) as OperationalQueueItem[];
        const nextMatchIds = queueItems
          .filter((item) => item.item_type == "MATCH")
          .map((item) => item.item_id);
        const nextIndividualSessionIds = queueItems
          .filter((item) => item.item_type == "INDIVIDUAL_SESSION")
          .map((item) => item.item_id);
        setMatchIds((currentIds) =>
          preserveEqualIds(currentIds, nextMatchIds),
        );
        setIndividualSessionIds((currentIds) =>
          preserveEqualIds(currentIds, nextIndividualSessionIds),
        );
      }

      setLoading(false);
      setIsFetching(false);
    },
    [championshipId, enabled, seasonYear],
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    matchIds,
    individualSessionIds,
    loading,
    isFetching,
    refetch,
  };
}
