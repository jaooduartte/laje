import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipSeasonDivisionMovement, ChampionshipSeasonSettings } from "@/lib/types";

const CHAMPIONSHIP_SEASON_SETTINGS_CACHE_TTL_MS = 3_000;

type ChampionshipSeasonSettingsResult = {
  data: ChampionshipSeasonSettings | null;
  error: Error | null;
};

const championshipSeasonSettingsRequestByKey = new Map<
  string,
  Promise<ChampionshipSeasonSettingsResult>
>();
const championshipSeasonSettingsResultByKey = new Map<
  string,
  { expiresAt: number; result: ChampionshipSeasonSettingsResult }
>();

function resolveChampionshipSeasonSettingsKey(
  championshipId: string,
  seasonYear: number,
) {
  return `${championshipId}:${seasonYear}`;
}

function invalidateChampionshipSeasonSettings(
  championshipId: string,
  seasonYear: number,
) {
  championshipSeasonSettingsResultByKey.delete(
    resolveChampionshipSeasonSettingsKey(championshipId, seasonYear),
  );
}

export async function fetchChampionshipSeasonSettings(
  championshipId: string,
  seasonYear: number,
): Promise<ChampionshipSeasonSettingsResult> {
  const requestKey = resolveChampionshipSeasonSettingsKey(
    championshipId,
    seasonYear,
  );
  const currentRequest = championshipSeasonSettingsRequestByKey.get(requestKey);

  if (currentRequest) {
    return currentRequest;
  }

  const cachedResult = championshipSeasonSettingsResultByKey.get(requestKey);

  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return cachedResult.result;
  }

  const request = supabase
    .from("championship_season_settings")
    .select("*")
    .eq("championship_id", championshipId)
    .eq("season_year", seasonYear)
    .maybeSingle()
    .then((response) => {
      const result: ChampionshipSeasonSettingsResult = {
        data: (response.data as ChampionshipSeasonSettings | null) ?? null,
        error: response.error,
      };

      if (!result.error) {
        championshipSeasonSettingsResultByKey.set(requestKey, {
          expiresAt: Date.now() + CHAMPIONSHIP_SEASON_SETTINGS_CACHE_TTL_MS,
          result,
        });
      }

      return result;
    })
    .finally(() => {
      if (championshipSeasonSettingsRequestByKey.get(requestKey) === request) {
        championshipSeasonSettingsRequestByKey.delete(requestKey);
      }
    });

  championshipSeasonSettingsRequestByKey.set(requestKey, request);
  return request;
}

export async function saveChampionshipSeasonSettings(
  payload: Pick<
    ChampionshipSeasonSettings,
    | "championship_id"
    | "season_year"
    | "division_format"
    | "division_settlement_mode"
    | "principal_slots_count"
    | "principal_relegation_count"
    | "access_promotion_count"
    | "yellow_card_reset_phase"
  >,
): Promise<{ data: ChampionshipSeasonSettings | null; error: Error | null }> {
  const response = await supabase
    .from("championship_season_settings")
    .upsert(payload, {
      onConflict: "championship_id,season_year",
    })
    .select("*")
    .single();

  invalidateChampionshipSeasonSettings(
    payload.championship_id,
    payload.season_year,
  );

  return {
    data: (response.data as ChampionshipSeasonSettings | null) ?? null,
    error: response.error,
  };
}

export async function saveChampionshipSeasonDivisionMovements(
  payload: Array<
    Pick<
      ChampionshipSeasonDivisionMovement,
      | "championship_id"
      | "season_year"
      | "team_id"
      | "previous_division"
      | "next_division"
      | "source_division"
      | "ranking_position"
      | "rule_code"
      | "confirmed_by"
      | "confirmed_at"
    >
  >,
): Promise<{ data: ChampionshipSeasonDivisionMovement[]; error: Error | null }> {
  if (payload.length == 0) {
    return { data: [], error: null };
  }

  const response = await supabase
    .from("championship_season_division_movements")
    .upsert(payload, {
      onConflict: "championship_id,season_year,team_id",
    })
    .select("*");

  return {
    data: (response.data as ChampionshipSeasonDivisionMovement[] | null) ?? [],
    error: response.error,
  };
}

export async function replaceChampionshipSeasonDivisionMovements({
  championshipId,
  seasonYear,
  payload,
}: {
  championshipId: string;
  seasonYear: number;
  payload: Array<
    Pick<
      ChampionshipSeasonDivisionMovement,
      | "championship_id"
      | "season_year"
      | "team_id"
      | "previous_division"
      | "next_division"
      | "source_division"
      | "ranking_position"
      | "rule_code"
      | "confirmed_by"
      | "confirmed_at"
    >
  >;
}): Promise<{ data: ChampionshipSeasonDivisionMovement[]; error: Error | null }> {
  const deleteResponse = await supabase
    .from("championship_season_division_movements")
    .delete()
    .eq("championship_id", championshipId)
    .eq("season_year", seasonYear);

  if (deleteResponse.error) {
    return { data: [], error: deleteResponse.error };
  }

  return saveChampionshipSeasonDivisionMovements(payload);
}
