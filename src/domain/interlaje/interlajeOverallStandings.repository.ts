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
  opening_bonus_points: number;
  overall_points: number;
  confirmed_competitions_count: number;
  has_pending_tie_break: boolean;
}

export interface InterlajeOverallCompetitionPlacementInput {
  team_id: string;
  final_position: number;
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
