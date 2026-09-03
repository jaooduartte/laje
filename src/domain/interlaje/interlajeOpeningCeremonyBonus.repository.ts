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

export interface InterlajeWalkoverPenaltyCount {
  teamId: string;
  walkoverCount: number;
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
  registeredTeamIds: string[];
  walkoverPenaltyPoints: number | null;
  walkoverCounts: InterlajeWalkoverPenaltyCount[];
  error: Error | null;
}> {
  if (!championshipId || seasonYear == null) {
    return {
      settings: null,
      eligibleTeamIds: [],
      registeredTeamIds: [],
      walkoverPenaltyPoints: null,
      walkoverCounts: [],
      error: null,
    };
  }

  const [settingsResponse, adjustmentsResponse, registrationsResponse, walkoverResponse] = await Promise.all([
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
    supabase
      .from("championship_bracket_team_registrations")
      .select("team_id, championship_bracket_editions!inner(championship_id, season_year)")
      .eq("championship_bracket_editions.championship_id", championshipId)
      .eq("championship_bracket_editions.season_year", seasonYear),
    supabaseLoose.rpc("get_interlaje_walkover_penalty_adjustments", {
      _championship_id: championshipId,
      _season_year: seasonYear,
    }),
  ]);
  const walkoverRows = (walkoverResponse.data as Array<{
    points: number | string;
    team_id: string | null;
    walkover_count: number | string | null;
  }> | null) ?? [];

  return {
    settings: settingsResponse.data
      ? { points: Number(settingsResponse.data.points) }
      : null,
    eligibleTeamIds: (adjustmentsResponse.data ?? []).map(
      (adjustment) => adjustment.team_id,
    ),
    registeredTeamIds: Array.from(
      new Set((registrationsResponse.data ?? []).map((registration) => registration.team_id)),
    ),
    walkoverPenaltyPoints:
      walkoverRows.length > 0 ? Number(walkoverRows[0].points) : null,
    walkoverCounts: walkoverRows.flatMap((row) =>
      row.team_id && row.walkover_count != null
        ? [{ teamId: row.team_id, walkoverCount: Number(row.walkover_count) }]
        : [],
    ),
    error:
      settingsResponse.error ??
      adjustmentsResponse.error ??
      registrationsResponse.error ??
      walkoverResponse.error,
  };
}

export function saveInterlajeWalkoverPenaltyPoints(input: {
  championshipId: string;
  seasonYear: number;
  points: number;
}) {
  return supabaseLoose.rpc("save_interlaje_walkover_penalty_points", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _points: input.points,
  });
}

export function saveInterlajeWalkoverPenaltyCounts(input: {
  championshipId: string;
  seasonYear: number;
  counts: InterlajeWalkoverPenaltyCount[];
}) {
  return supabaseLoose.rpc("save_interlaje_walkover_penalty_counts", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _counts: input.counts.map((count) => ({
      team_id: count.teamId,
      walkover_count: count.walkoverCount,
    })),
  });
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
