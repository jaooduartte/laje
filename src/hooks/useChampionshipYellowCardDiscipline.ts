import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

export interface YellowCardDisciplineMatch {
  match_id: string;
  match_number: number | null;
  scheduled_date: string | null;
  start_time: string | null;
  phase: string;
  opponent_name: string | null;
  yellow_cards: number;
  red_cards_direct: number;
}

export interface YellowCardDisciplineNextMatch {
  match_id: string;
  scheduled_date: string | null;
  start_time: string | null;
  opponent_name: string | null;
}

export interface YellowCardDisciplineServedSuspension {
  suspension_match_id: string;
  direct_red: boolean;
  yellow_accumulation: boolean;
  served_match: YellowCardDisciplineNextMatch & {
    match_number: number | null;
    phase: string;
  };
}

export interface YellowCardDisciplineAthlete {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  yellow_cards_total: number;
  yellow_cards_active: number;
  red_cards_direct_total: number;
  is_suspended: boolean;
  suspension_causes: Array<{
    match_id: string;
    direct_red: boolean;
    yellow_accumulation: boolean;
  }>;
  served_suspensions?: YellowCardDisciplineServedSuspension[];
  effective_reset_phase: string;
  next_match: YellowCardDisciplineNextMatch | null;
  matches: YellowCardDisciplineMatch[];
}

export interface ChampionshipYellowCardDiscipline {
  season_year: number;
  athletes: YellowCardDisciplineAthlete[];
}

type ChampionshipYellowCardDisciplineResult = {
  data: ChampionshipYellowCardDiscipline | null;
  error: unknown;
};

const championshipYellowCardDisciplineRequestByKey = new Map<
  string,
  Promise<ChampionshipYellowCardDisciplineResult>
>();
const championshipYellowCardDisciplineResultByKey = new Map<
  string,
  {
    expiresAt: number;
    result: ChampionshipYellowCardDisciplineResult;
  }
>();
const CHAMPIONSHIP_YELLOW_CARD_DISCIPLINE_REALTIME_DEBOUNCE_MS = 1000;

function resolveChampionshipYellowCardDisciplineRequestKey(
  championshipId: string,
  seasonYear: number,
) {
  return `${championshipId}-${seasonYear}`;
}

function fetchSharedChampionshipYellowCardDiscipline(
  championshipId: string,
  seasonYear: number,
  forceFresh = false,
) {
  const requestKey = resolveChampionshipYellowCardDisciplineRequestKey(
    championshipId,
    seasonYear,
  );
  const currentRequest = championshipYellowCardDisciplineRequestByKey.get(
    requestKey,
  );

  if (currentRequest) {
    return currentRequest;
  }

  const cachedResult = championshipYellowCardDisciplineResultByKey.get(
    requestKey,
  );

  if (!forceFresh && cachedResult && cachedResult.expiresAt > Date.now()) {
    return Promise.resolve(cachedResult.result);
  }

  const request = supabase
    .rpc("get_championship_yellow_card_discipline", {
      _championship_id: championshipId,
      _season_year: seasonYear,
    })
    .then((response) => {
      const result = {
        data:
          (response.data as unknown as ChampionshipYellowCardDiscipline) ?? null,
        error: response.error,
      };

      if (!result.error) {
        championshipYellowCardDisciplineResultByKey.set(requestKey, {
          expiresAt:
            Date.now() + CHAMPIONSHIP_YELLOW_CARD_DISCIPLINE_REALTIME_DEBOUNCE_MS,
          result,
        });
      }

      return result;
    })
    .finally(() => {
      if (championshipYellowCardDisciplineRequestByKey.get(requestKey) === request) {
        championshipYellowCardDisciplineRequestByKey.delete(requestKey);
      }
    });

  championshipYellowCardDisciplineRequestByKey.set(requestKey, request);
  return request;
}

function invalidateChampionshipYellowCardDiscipline(
  championshipId: string,
  seasonYear: number,
) {
  championshipYellowCardDisciplineResultByKey.delete(
    resolveChampionshipYellowCardDisciplineRequestKey(championshipId, seasonYear),
  );
}

export function useChampionshipYellowCardDiscipline({
  championshipId,
  seasonYear,
}: {
  championshipId: string | null;
  seasonYear: number | null;
}) {
  const [discipline, setDiscipline] =
    useState<ChampionshipYellowCardDiscipline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduledRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const hasQueuedRefetchRef = useRef(false);
  const shouldForceFreshOnQueuedRefetchRef = useRef(false);

  const fetch = useCallback(async (forceFresh = false) => {
    if (!championshipId || !seasonYear) {
      setDiscipline(null);
      setError(null);
      setLoading(false);
      isFetchingRef.current = false;
      hasQueuedRefetchRef.current = false;
      shouldForceFreshOnQueuedRefetchRef.current = false;
      return;
    }

    if (isFetchingRef.current) {
      hasQueuedRefetchRef.current = true;
      shouldForceFreshOnQueuedRefetchRef.current =
        shouldForceFreshOnQueuedRefetchRef.current || forceFresh;
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    try {
      const { data, error: rpcError } =
        await fetchSharedChampionshipYellowCardDiscipline(
          championshipId,
          seasonYear,
          forceFresh,
        );

      if (rpcError) {
        setDiscipline(null);
        setError("Não foi possível carregar os cartões. Tente novamente.");
        return;
      }

      setDiscipline((data as unknown as ChampionshipYellowCardDiscipline) ?? null);
      setError(null);
    } catch {
      setDiscipline(null);
      setError("Não foi possível carregar os cartões. Tente novamente.");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;

      if (hasQueuedRefetchRef.current) {
        hasQueuedRefetchRef.current = false;
        const shouldForceFresh = shouldForceFreshOnQueuedRefetchRef.current;
        shouldForceFreshOnQueuedRefetchRef.current = false;
        void fetch(shouldForceFresh);
      }
    }
  }, [championshipId, seasonYear]);

  useEffect(() => {
    void fetch();

    if (!championshipId || !seasonYear) {
      return;
    }

    const scheduleFetch = () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
      }

      scheduledRefetchTimeoutRef.current = setTimeout(() => {
        scheduledRefetchTimeoutRef.current = null;
        invalidateChampionshipYellowCardDiscipline(championshipId, seasonYear);
        void fetch(true);
      }, CHAMPIONSHIP_YELLOW_CARD_DISCIPLINE_REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`yellow-card-discipline-${championshipId}-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_yellow_card_players" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_red_card_players" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `championship_id=eq.${championshipId}` }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_season_settings", filter: `championship_id=eq.${championshipId}` }, scheduleFetch)
      .subscribe();

    return () => {
      if (scheduledRefetchTimeoutRef.current) {
        clearTimeout(scheduledRefetchTimeoutRef.current);
        scheduledRefetchTimeoutRef.current = null;
      }

      supabase.removeChannel(channel);
    };
  }, [championshipId, seasonYear, fetch]);

  const refetch = useCallback(
    () => fetch(true),
    [fetch],
  );

  return {
    discipline,
    loading,
    error,
    refetch,
  };
}
