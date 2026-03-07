import { supabase } from "@/integrations/supabase/client";
import type { ChampionshipBracketSetupFormValues, MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipBracketView } from "@/lib/types";

export async function generateChampionshipBracketGroups(
  championship_id: string,
  payload: ChampionshipBracketSetupFormValues,
) {
  return supabase.rpc("generate_championship_bracket_groups", {
    _championship_id: championship_id,
    _payload: payload,
  });
}

export async function generateChampionshipKnockout(
  championship_id: string,
  bracket_edition_id?: string,
) {
  return supabase.rpc("generate_championship_knockout", {
    _championship_id: championship_id,
    _bracket_edition_id: bracket_edition_id ?? null,
  });
}

export async function fetchChampionshipBracketView(
  championship_id: string,
): Promise<{ data: ChampionshipBracketView | null; error: Error | null }> {
  const response = await supabase.rpc("get_championship_bracket_view", {
    _championship_id: championship_id,
  });

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  return {
    data: (response.data as ChampionshipBracketView | null) ?? null,
    error: null,
  };
}

export async function saveMatchSets(match_id: string, sets: MatchSetInput[]) {
  return supabase.rpc("save_match_sets", {
    _match_id: match_id,
    _sets: sets,
  });
}

export async function fetchMatchSets(match_id: string): Promise<{ data: MatchSetInput[]; error: Error | null }> {
  const response = await supabase.rpc("get_match_sets", {
    _match_id: match_id,
  });

  if (response.error) {
    return {
      data: [],
      error: response.error,
    };
  }

  return {
    data: (response.data as MatchSetInput[] | null) ?? [],
    error: null,
  };
}
