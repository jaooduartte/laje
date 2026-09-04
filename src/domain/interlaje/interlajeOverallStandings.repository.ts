import { supabase } from "@/integrations/supabase/client";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

type LooseSupabase = {
  rpc: (functionName: string, arguments_: Record<string, unknown>) => Promise<{
    data: unknown;
    error: Error | null;
  }>;
};

const supabaseLoose = supabase as unknown as LooseSupabase;

export interface InterlajeOverallStanding {
  team_id: string;
  team_name: string;
  placement_points: number;
  confirmed_placement_points: number;
  projected_placement_points: number;
  opening_bonus_points: number;
  walkover_count: number;
  walkover_penalty_points: number;
  overall_points: number;
  confirmed_competitions_count: number;
  has_projected_placement_points: boolean;
  has_pending_tie_break: boolean;
}

export interface InterlajeOverallCompetitionPlacementInput {
  team_id: string;
  final_position: number;
}

export interface InterlajePositionPointSetting {
  final_position: number;
  points: number;
}

export interface InterlajeCompetitionStanding {
  team_id: string;
  team_name: string;
  division: TeamDivision | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  yellow_cards: number;
  red_cards: number;
  blue_cards: number;
  two_minute_penalties: number;
  final_position: number;
  placement_points: number;
  placement_status: "CONFIRMED" | "PROJECTED";
  placement_basis: "GROUP_STAGE" | "KNOCKOUT";
}

export async function fetchInterlajeOverallStandings(
  championshipId: string | null | undefined,
  seasonYear: number | null | undefined,
): Promise<{ data: InterlajeOverallStanding[]; error: Error | null }> {
  if (!championshipId || !seasonYear) {
    return { data: [], error: null };
  }

  const response = await supabaseLoose.rpc("get_interlaje_overall_standings", {
    _championship_id: championshipId,
    _season_year: seasonYear,
  });

  return {
    data: (response.data as InterlajeOverallStanding[] | null) ?? [],
    error: response.error,
  };
}

export async function fetchInterlajeCompetitionStandings(input: {
  championshipId: string | null | undefined;
  seasonYear: number | null | undefined;
  sportId: string | null | undefined;
  naipe: MatchNaipe | null | undefined;
  division: TeamDivision | null;
}): Promise<{ data: InterlajeCompetitionStanding[]; error: Error | null }> {
  if (!input.championshipId || !input.seasonYear || !input.sportId || !input.naipe) {
    return { data: [], error: null };
  }

  const response = await supabaseLoose.rpc("get_interlaje_competition_standings", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _sport_id: input.sportId,
    _naipe: input.naipe,
    _division: input.division,
  });

  return {
    data: (response.data as InterlajeCompetitionStanding[] | null) ?? [],
    error: response.error,
  };
}

export async function fetchInterlajePositionPointSettings(
  championshipId: string | null | undefined,
  seasonYear: number | null | undefined,
): Promise<{ data: InterlajePositionPointSetting[]; error: Error | null }> {
  if (!championshipId || !seasonYear) {
    return { data: [], error: null };
  }

  const response = await supabaseLoose.rpc("get_interlaje_position_point_settings", {
    _championship_id: championshipId,
    _season_year: seasonYear,
  });

  return {
    data: (response.data as InterlajePositionPointSetting[] | null) ?? [],
    error: response.error,
  };
}

export function saveInterlajePositionPointSettings(input: {
  championshipId: string;
  seasonYear: number;
  settings: InterlajePositionPointSetting[];
}) {
  return supabaseLoose.rpc("save_interlaje_position_point_settings", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _settings: input.settings,
  });
}

export async function saveInterlajeOverallCompetitionPlacements(input: {
  championshipId: string;
  seasonYear: number;
  sportId: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  placements: InterlajeOverallCompetitionPlacementInput[];
  justification?: string | null;
}) {
  return supabaseLoose.rpc("save_interlaje_overall_competition_placements", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _sport_id: input.sportId,
    _naipe: input.naipe,
    _division: input.division,
    _placements: input.placements,
    _justification: input.justification ?? null,
  });
}

export async function saveInterlajeOpeningCeremonyBonus(input: {
  championshipId: string;
  seasonYear: number;
  teamId: string;
  eligible: boolean;
  justification?: string | null;
}) {
  return supabaseLoose.rpc("save_interlaje_opening_ceremony_bonus", {
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _team_id: input.teamId,
    _eligible: input.eligible,
    _justification: input.justification ?? null,
  });
}
