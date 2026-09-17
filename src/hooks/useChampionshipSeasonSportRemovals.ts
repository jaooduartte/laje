import { useCallback, useEffect, useRef, useState } from "react";
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

type SeasonSportRemovalsState = {
  scopeKey: string | null;
  removedSportIds: string[];
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
  const scopeKey =
    championshipId && seasonYear != null
      ? `${championshipId}:${seasonYear}`
      : null;
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  const [state, setState] = useState<SeasonSportRemovalsState>({
    scopeKey: null,
    removedSportIds: [],
  });

  const refetch = useCallback(async () => {
    const requestedScopeKey = scopeKey;

    if (!championshipId || seasonYear == null || !requestedScopeKey) {
      setState({ scopeKey: null, removedSportIds: [] });
      return;
    }

    const { data, error } = await supabaseSeasonSportRemovalsClient
      .from("championship_season_sport_removals")
      .select("sport_id")
      .eq("championship_id", championshipId)
      .eq("season_year", seasonYear);

    if (scopeKeyRef.current != requestedScopeKey) {
      return;
    }

    if (error) {
      console.error(
        "Erro ao carregar modalidades removidas da temporada:",
        error.message,
      );
      setState({ scopeKey: requestedScopeKey, removedSportIds: [] });
      return;
    }

    setState({
      scopeKey: requestedScopeKey,
      removedSportIds: data?.map((removal) => removal.sport_id) ?? [],
    });
  }, [championshipId, scopeKey, seasonYear]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const isCurrentScopeResolved = state.scopeKey == scopeKey;

  return {
    removedSportIds: isCurrentScopeResolved ? state.removedSportIds : [],
    loading: scopeKey != null && !isCurrentScopeResolved,
    refetch,
  };
}
