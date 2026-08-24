import { supabase } from "@/integrations/supabase/client";

type LooseQuery = {
  eq: (column: string, value: string | number) => LooseQuery;
  maybeSingle: () => Promise<{
    data: { points: number | string } | null;
    error: Error | null;
  }>;
  then: <ResultType>(
    onfulfilled?: (
      value: {
        data: Array<{ team_id: string }> | null;
        error: Error | null;
      },
    ) => ResultType | PromiseLike<ResultType>,
  ) => Promise<ResultType>;
};

type LooseSupabase = {
  rpc: (functionName: string, arguments_: Record<string, unknown>) => Promise<{
    data: unknown;
    error: Error | null;
  }>;
  from: (tableName: string) => {
    select: (columns: string) => LooseQuery;
  };
};

const supabaseLoose = supabase as unknown as LooseSupabase;

export interface InterlajeOpeningCeremonyBonusSettings {
  points: number;
}

export async function fetchInterlajeOpeningCeremonyBonus({
  championshipId,
  seasonYear,
}: {
  championshipId: string | null | undefined;
  seasonYear: number | null | undefined;
}): Promise<{
  settings: InterlajeOpeningCeremonyBonusSettings | null;
  eligibleTeamIds: string[];
  error: Error | null;
}> {
  if (!championshipId || seasonYear == null) {
    return { settings: null, eligibleTeamIds: [], error: null };
  }

  const [settingsResponse, adjustmentsResponse] = await Promise.all([
    supabaseLoose
      .from("championship_opening_ceremony_bonus_settings")
      .select("points")
      .eq("championship_id", championshipId)
      .eq("season_year", seasonYear)
      .maybeSingle(),
    supabaseLoose
      .from("championship_overall_score_adjustments")
      .select("team_id")
      .eq("championship_id", championshipId)
      .eq("season_year", seasonYear)
      .eq("adjustment_type", "OPENING_CEREMONY"),
  ]);

  return {
    settings: settingsResponse.data
      ? { points: Number(settingsResponse.data.points) }
      : null,
    eligibleTeamIds: (adjustmentsResponse.data ?? []).map(
      (adjustment) => adjustment.team_id,
    ),
    error: settingsResponse.error ?? adjustmentsResponse.error,
  };
}

export function saveInterlajeOpeningCeremonyBonusPoints(input: {
  championshipId: string;
  seasonYear: number;
  points: number;
}) {
  return supabaseLoose.rpc("save_interlaje_opening_ceremony_bonus_points", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _points: input.points,
  });
}

export function saveInterlajeOpeningCeremonyBonusEligibility(input: {
  championshipId: string;
  seasonYear: number;
  teamId: string;
  eligible: boolean;
}) {
  return supabaseLoose.rpc("save_interlaje_opening_ceremony_bonus", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _team_id: input.teamId,
    _eligible: input.eligible,
    _justification: null,
  });
}
