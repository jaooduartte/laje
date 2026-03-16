import { supabase } from "@/integrations/supabase/client";
import type {
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketLocationTemplateSaveInput,
  ChampionshipBracketPreviewResult,
  ChampionshipBracketSetupFormValues,
  ChampionshipBracketTieBreakPendingContext,
  ChampionshipBracketTieBreakResolutionSaveInput,
  MatchSetInput,
} from "@/domain/championship-brackets/championshipBracket.types";
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

export async function previewChampionshipBracketGroups(
  championship_id: string,
  payload: ChampionshipBracketSetupFormValues,
): Promise<{ data: ChampionshipBracketPreviewResult | null; error: Error | null }> {
  const response = await supabase.rpc("preview_championship_bracket_groups", {
    _championship_id: championship_id,
    _payload: payload,
  });

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  return {
    data: (response.data as ChampionshipBracketPreviewResult | null) ?? null,
    error: null,
  };
}

export async function fetchChampionshipBracketLocationTemplates(): Promise<{
  data: ChampionshipBracketLocationTemplate[];
  error: Error | null;
}> {
  const templatesResponse = await supabase
    .from("championship_bracket_location_templates")
    .select("id, name, created_at, updated_at")
    .order("name", { ascending: true });

  if (templatesResponse.error) {
    return {
      data: [],
      error: templatesResponse.error,
    };
  }

  const templateIds = (templatesResponse.data ?? []).map((locationTemplate) => locationTemplate.id);

  if (templateIds.length == 0) {
    return {
      data: [],
      error: null,
    };
  }

  const courtsResponse = await supabase
    .from("championship_bracket_location_template_courts")
    .select("id, location_template_id, name, position")
    .in("location_template_id", templateIds)
    .order("position", { ascending: true });

  if (courtsResponse.error) {
    return {
      data: [],
      error: courtsResponse.error,
    };
  }

  const courtIds = (courtsResponse.data ?? []).map((locationTemplateCourt) => locationTemplateCourt.id);
  const courtSportsResponse =
    courtIds.length == 0
      ? { data: [], error: null }
      : await supabase
          .from("championship_bracket_location_template_court_sports")
          .select("location_template_court_id, sport_id")
          .in("location_template_court_id", courtIds);

  if (courtSportsResponse.error) {
    return {
      data: [],
      error: courtSportsResponse.error,
    };
  }

  const sportIdsByCourtId = (courtSportsResponse.data ?? []).reduce<Record<string, string[]>>((carry, courtSport) => {
    carry[courtSport.location_template_court_id] = [...(carry[courtSport.location_template_court_id] ?? []), courtSport.sport_id];
    return carry;
  }, {});

  const courtsByTemplateId = (courtsResponse.data ?? []).reduce<
    Record<string, ChampionshipBracketLocationTemplate["courts"]>
  >((carry, locationTemplateCourt) => {
    carry[locationTemplateCourt.location_template_id] = [
      ...(carry[locationTemplateCourt.location_template_id] ?? []),
      {
        id: locationTemplateCourt.id,
        name: locationTemplateCourt.name,
        position: locationTemplateCourt.position,
        sport_ids: [...new Set(sportIdsByCourtId[locationTemplateCourt.id] ?? [])],
      },
    ];
    return carry;
  }, {});

  return {
    data: (templatesResponse.data ?? [])
      .map((locationTemplate) => ({
        id: locationTemplate.id,
        name: locationTemplate.name,
        created_at: locationTemplate.created_at,
        updated_at: locationTemplate.updated_at,
        courts: (courtsByTemplateId[locationTemplate.id] ?? []).sort((leftCourt, rightCourt) => {
          if (leftCourt.position == rightCourt.position) {
            return leftCourt.name.localeCompare(rightCourt.name, "pt-BR", { sensitivity: "base" });
          }

          return leftCourt.position - rightCourt.position;
        }),
      }))
      .sort((leftTemplate, rightTemplate) => leftTemplate.name.localeCompare(rightTemplate.name, "pt-BR", { sensitivity: "base" })),
    error: null,
  };
}

export async function saveChampionshipBracketLocationTemplate(
  payload: ChampionshipBracketLocationTemplateSaveInput,
): Promise<{ data: string | null; error: Error | null }> {
  const response = await supabase.rpc("save_championship_bracket_location_template", {
    _payload: {
      id: payload.id ?? null,
      name: payload.name,
      courts: payload.courts.map((court) => ({
        id: court.id,
        name: court.name,
        position: court.position,
        sport_ids: court.sport_ids,
      })),
    },
  });

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  return {
    data: (response.data as string | null) ?? null,
    error: null,
  };
}

export async function deleteChampionshipBracketLocationTemplate(
  location_template_id: string,
): Promise<{ error: Error | null }> {
  const response = await supabase
    .from("championship_bracket_location_templates")
    .delete()
    .eq("id", location_template_id);

  return {
    error: response.error,
  };
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

export async function fetchChampionshipBracketPendingTieBreaks(
  championship_id: string,
  bracket_edition_id?: string,
): Promise<{ data: ChampionshipBracketTieBreakPendingContext[]; error: Error | null }> {
  const response = await supabase.rpc("get_championship_bracket_pending_tie_breaks", {
    _championship_id: championship_id,
    _bracket_edition_id: bracket_edition_id ?? null,
  });

  if (response.error) {
    return {
      data: [],
      error: response.error,
    };
  }

  return {
    data: (response.data as ChampionshipBracketTieBreakPendingContext[] | null) ?? [],
    error: null,
  };
}

export async function saveChampionshipBracketTieBreakResolution(
  payload: ChampionshipBracketTieBreakResolutionSaveInput,
): Promise<{ data: string | null; error: Error | null }> {
  const response = await supabase.rpc("save_championship_bracket_tie_break_resolution", {
    _payload: {
      context_key: payload.context_key,
      competition_id: payload.competition_id,
      context_type: payload.context_type,
      group_id: payload.group_id ?? null,
      qualification_rank: payload.qualification_rank ?? null,
      team_ids: payload.team_ids,
    },
  });

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  return {
    data: (response.data as string | null) ?? null,
    error: null,
  };
}

export async function fetchChampionshipBracketView(
  championship_id: string,
  season_year?: number | null,
): Promise<{ data: ChampionshipBracketView | null; error: Error | null }> {
  const response = await supabase.rpc("get_championship_bracket_view", {
    _championship_id: championship_id,
    _season_year: season_year ?? null,
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
