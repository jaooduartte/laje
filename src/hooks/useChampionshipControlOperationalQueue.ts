import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OperationalQueueItem = {
  item_type: "MATCH" | "INDIVIDUAL_SESSION";
  item_id: string;
};

type OperationalQueueStateRow = {
  match_ids: string[] | null;
  individual_session_ids: string[] | null;
  full_queue_items_count: number | string | null;
};

type SupabaseLooseError = {
  code?: string;
  message: string;
};

type SupabaseCountQuery = PromiseLike<{
  count: number | null;
  error: SupabaseLooseError | null;
}> & {
  eq: (column: string, value: unknown) => SupabaseCountQuery;
  in: (column: string, values: readonly unknown[]) => SupabaseCountQuery;
};

type SupabaseLooseClient = {
  rpc: (
    functionName: string,
    argumentsValue: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: SupabaseLooseError | null }>;
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => SupabaseCountQuery;
  };
};

type OperationalQueueStateResult = {
  matchIds: string[];
  individualSessionIds: string[];
  fullQueueItemsCount: number;
};

const supabaseLoose = supabase as unknown as SupabaseLooseClient;
let operationalQueueStateRpcAvailable: boolean | null = null;

function preserveEqualIds(currentIds: string[], nextIds: string[]) {
  return currentIds.length == nextIds.length &&
    currentIds.every((currentId, index) => currentId == nextIds[index])
    ? currentIds
    : nextIds;
}

function isMissingOperationalQueueStateRpc(error: SupabaseLooseError) {
  return (
    error.code == "PGRST202" ||
    (error.message.includes("get_championship_control_operational_queue_state") &&
      (error.message.includes("schema cache") ||
        error.message.includes("Could not find the function")))
  );
}

async function fetchLegacyOperationalQueueState(
  championshipId: string,
  seasonYear: number,
): Promise<{
  data: OperationalQueueStateResult | null;
  error: SupabaseLooseError | null;
}> {
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

  if (operationalQueueResponse.error) {
    return { data: null, error: operationalQueueResponse.error };
  }

  if (matchesCountResponse.error || sessionsCountResponse.error) {
    return {
      data: null,
      error: matchesCountResponse.error ?? sessionsCountResponse.error,
    };
  }

  const queueItems = (operationalQueueResponse.data ?? []) as OperationalQueueItem[];

  return {
    data: {
      matchIds: queueItems
        .filter((item) => item.item_type == "MATCH")
        .map((item) => item.item_id),
      individualSessionIds: queueItems
        .filter((item) => item.item_type == "INDIVIDUAL_SESSION")
        .map((item) => item.item_id),
      fullQueueItemsCount:
        (matchesCountResponse.count ?? 0) + (sessionsCountResponse.count ?? 0),
    },
    error: null,
  };
}

async function fetchOperationalQueueState(
  championshipId: string,
  seasonYear: number,
): Promise<{
  data: OperationalQueueStateResult | null;
  error: SupabaseLooseError | null;
}> {
  if (operationalQueueStateRpcAvailable !== false) {
    const response = await supabaseLoose.rpc(
      "get_championship_control_operational_queue_state",
      {
        _championship_id: championshipId,
        _season_year: seasonYear,
      },
    );

    if (!response.error) {
      operationalQueueStateRpcAvailable = true;
      const stateRow = ((response.data ?? []) as OperationalQueueStateRow[])[0];

      return {
        data: {
          matchIds: stateRow?.match_ids ?? [],
          individualSessionIds: stateRow?.individual_session_ids ?? [],
          fullQueueItemsCount: Number(stateRow?.full_queue_items_count ?? 0),
        },
        error: null,
      };
    }

    if (!isMissingOperationalQueueStateRpc(response.error)) {
      return { data: null, error: response.error };
    }

    // The migration may not have reached the project yet during a rolling
    // deployment. Cache that fact for this browser session and use the
    // backwards-compatible implementation without repeatedly probing it.
    operationalQueueStateRpcAvailable = false;
  }

  return fetchLegacyOperationalQueueState(championshipId, seasonYear);
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
  const hasLoadedQueueRef = useRef(false);
  const isFetchingQueueRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);
  const queuedShowFetchingRef = useRef(false);

  const refetch = useCallback(
    async ({ showFetching = false }: { showFetching?: boolean } = {}) => {
      if (!enabled || !championshipId || typeof seasonYear != "number") {
        setMatchIds([]);
        setIndividualSessionIds([]);
        setFullQueueItemsCount(null);
        setLoading(false);
        setIsFetching(false);
        hasLoadedQueueRef.current = false;
        isFetchingQueueRef.current = false;
        hasQueuedRefetchRef.current = false;
        queuedShowFetchingRef.current = false;
        return;
      }

      if (isFetchingQueueRef.current) {
        hasQueuedRefetchRef.current = true;
        queuedShowFetchingRef.current =
          queuedShowFetchingRef.current || showFetching;
        return;
      }

      isFetchingQueueRef.current = true;

      if (showFetching) {
        setIsFetching(true);
      } else if (!hasLoadedQueueRef.current) {
        setLoading(true);
      }

      try {
        const { data, error } = await fetchOperationalQueueState(
          championshipId,
          seasonYear,
        );

        if (error || !data) {
          console.error(
            "Erro ao carregar fila operacional do controle:",
            error?.message ?? "Resposta vazia da fila operacional.",
          );
          return;
        }

        setMatchIds((currentIds) =>
          preserveEqualIds(currentIds, data.matchIds),
        );
        setIndividualSessionIds((currentIds) =>
          preserveEqualIds(currentIds, data.individualSessionIds),
        );
        setFullQueueItemsCount(data.fullQueueItemsCount);
        hasLoadedQueueRef.current = true;
      } finally {
        isFetchingQueueRef.current = false;
        setLoading(false);
        setIsFetching(false);

        if (hasQueuedRefetchRef.current) {
          hasQueuedRefetchRef.current = false;
          const queuedShowFetching = queuedShowFetchingRef.current;
          queuedShowFetchingRef.current = false;
          void refetch({ showFetching: queuedShowFetching });
        }
      }
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
