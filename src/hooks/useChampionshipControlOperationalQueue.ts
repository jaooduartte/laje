import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OperationalQueueItem = {
  item_type: "MATCH" | "INDIVIDUAL_SESSION";
  item_id: string;
};

type SupabaseCountQuery = PromiseLike<{
  count: number | null;
  error: Error | null;
}> & {
  eq: (column: string, value: unknown) => SupabaseCountQuery;
  in: (column: string, values: readonly unknown[]) => SupabaseCountQuery;
};

type SupabaseLooseClient = {
  rpc: (
    functionName: string,
    argumentsValue: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => SupabaseCountQuery;
  };
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
  const [fullQueueItemsCount, setFullQueueItemsCount] = useState<
    number | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  const refetch = useCallback(
    async ({ showFetching = false }: { showFetching?: boolean } = {}) => {
      if (!enabled || !championshipId || typeof seasonYear != "number") {
        setMatchIds([]);
        setIndividualSessionIds([]);
        setFullQueueItemsCount(null);
        setLoading(false);
        setIsFetching(false);
        return;
      }

      if (showFetching) {
        setIsFetching(true);
      } else {
        setLoading(true);
      }

      const [operationalQueueResponse, matchesCountResponse, sessionsCountResponse] =
        await Promise.all([
          supabaseLoose.rpc("get_championship_control_operational_queue", {
            _championship_id: championshipId,
            _season_year: seasonYear,
          }),
          supabaseLoose
            .from("matches")
            .select("id", { count: "exact", head: true })
            .eq("championship_id", championshipId)
            .eq("season_year", seasonYear)
            .in("status", ["SCHEDULED", "LIVE"]),
          supabaseLoose
            .from("championship_individual_sessions")
            .select("id", { count: "exact", head: true })
            .eq("championship_id", championshipId)
            .eq("season_year", seasonYear)
            .in("status", ["DRAFT", "SCHEDULED", "LIVE", "FINISHED"]),
        ]);

      const { data, error } = operationalQueueResponse;

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

      if (matchesCountResponse.error || sessionsCountResponse.error) {
        console.error(
          "Erro ao carregar total da fila completa do controle:",
          matchesCountResponse.error?.message ?? sessionsCountResponse.error?.message,
        );
        setFullQueueItemsCount(null);
      } else {
        setFullQueueItemsCount(
          (matchesCountResponse.count ?? 0) +
            (sessionsCountResponse.count ?? 0),
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
    fullQueueItemsCount,
    loading,
    isFetching,
    refetch,
  };
}
