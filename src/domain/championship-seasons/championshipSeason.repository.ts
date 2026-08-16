import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipSeasonDivisionMovement, ChampionshipSeasonSettings } from "@/lib/types";

export async function fetchChampionshipSeasonSettings(
  championshipId: string,
  seasonYear: number,
): Promise<{ data: ChampionshipSeasonSettings | null; error: Error | null }> {
  const response = await supabase
    .from("championship_season_settings")
    .select("*")
    .eq("championship_id", championshipId)
    .eq("season_year", seasonYear)
    .maybeSingle();

  return {
    data: (response.data as ChampionshipSeasonSettings | null) ?? null,
    error: response.error,
  };
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
  >,
): Promise<{ data: ChampionshipSeasonSettings | null; error: Error | null }> {
  const response = await supabase
    .from("championship_season_settings")
    .upsert(payload, {
      onConflict: "championship_id,season_year",
    })
    .select("*")
    .single();

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
