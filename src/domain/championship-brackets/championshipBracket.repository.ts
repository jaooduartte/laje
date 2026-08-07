import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  ChampionshipCorrectedGroupStanding,
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketLocationTemplateSaveInput,
  ChampionshipBracketPreviewResult,
  ChampionshipBracketResolvedTieBreakOrderContext,
  ChampionshipBracketCourtSequenceMode,
  ChampionshipBracketSetupFormValues,
  ChampionshipBracketTieBreakPendingContext,
  ChampionshipBracketTieBreakResolutionSaveInput,
  MatchSetInput,
  BracketDaySchedule,
  BracketDayScheduleUpdate,
  BracketCourtPriorityUpdate,
  BracketDayCourtSports,
  BracketLocationSportPriorityGroup,
  BracketLocationSportPriorityUpdate,
  BracketKnockoutCourtPriorityGroup,
  BracketKnockoutCourtPriorityUpdate,
  BracketGeneratedLocationGroup,
  BracketGeneratedLocationGroupUpdate,
  EditableMatchScheduleSlot,
  EditableMatchScheduleSlotQueryInput,
  ScheduledMatchLogisticsUpdateInput,
} from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
import type { ChampionshipBracketView } from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

function toSupabaseJson(value: unknown): Json {
  return value as Json;
}

export async function generateChampionshipBracketGroups(
  championship_id: string,
  payload: ChampionshipBracketSetupFormValues,
) {
  return supabase.rpc("generate_championship_bracket_groups", {
    _championship_id: championship_id,
    _payload: toSupabaseJson(payload),
  });
}

export async function previewChampionshipBracketGroups(
  championship_id: string,
  payload: ChampionshipBracketSetupFormValues,
): Promise<{
  data: ChampionshipBracketPreviewResult | null;
  error: Error | null;
}> {
  const response = await supabase.rpc("preview_championship_bracket_groups", {
    _championship_id: championship_id,
    _payload: toSupabaseJson(payload),
  });

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  return {
    data:
      (response.data as unknown as ChampionshipBracketPreviewResult | null) ??
      null,
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

  const templateIds = (templatesResponse.data ?? []).map(
    (locationTemplate) => locationTemplate.id,
  );

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

  const courtIds = (courtsResponse.data ?? []).map(
    (locationTemplateCourt) => locationTemplateCourt.id,
  );
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

  const sportIdsByCourtId = (courtSportsResponse.data ?? []).reduce<
    Record<string, string[]>
  >((carry, courtSport) => {
    carry[courtSport.location_template_court_id] = [
      ...(carry[courtSport.location_template_court_id] ?? []),
      courtSport.sport_id,
    ];
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
        sport_ids: [
          ...new Set(sportIdsByCourtId[locationTemplateCourt.id] ?? []),
        ],
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
        courts: (courtsByTemplateId[locationTemplate.id] ?? []).sort(
          (leftCourt, rightCourt) => {
            if (leftCourt.position == rightCourt.position) {
              return leftCourt.name.localeCompare(rightCourt.name, "pt-BR", {
                sensitivity: "base",
              });
            }

            return leftCourt.position - rightCourt.position;
          },
        ),
      }))
      .sort((leftTemplate, rightTemplate) =>
        leftTemplate.name.localeCompare(rightTemplate.name, "pt-BR", {
          sensitivity: "base",
        }),
      ),
    error: null,
  };
}

export async function saveChampionshipBracketLocationTemplate(
  payload: ChampionshipBracketLocationTemplateSaveInput,
): Promise<{ data: string | null; error: Error | null }> {
  const response = await supabase.rpc(
    "save_championship_bracket_location_template",
    {
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
    },
  );

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
): Promise<{
  data: ChampionshipBracketTieBreakPendingContext[];
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "get_championship_bracket_pending_tie_breaks",
    {
      _championship_id: championship_id,
      _bracket_edition_id: bracket_edition_id ?? null,
    },
  );

  if (response.error) {
    return {
      data: [],
      error: response.error,
    };
  }

  return {
    data:
      (response.data as unknown as
        | ChampionshipBracketTieBreakPendingContext[]
        | null) ?? [],
    error: null,
  };
}

export async function fetchChampionshipBracketResolvedTieBreakOrders(
  championship_id: string,
  season_year?: number | null,
): Promise<{
  data: ChampionshipBracketResolvedTieBreakOrderContext[];
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "get_championship_bracket_resolved_tie_break_orders",
    {
      _championship_id: championship_id,
      _season_year: season_year ?? null,
    },
  );

  if (response.error) {
    return {
      data: [],
      error: response.error,
    };
  }

  return {
    data:
      (response.data as unknown as
        | ChampionshipBracketResolvedTieBreakOrderContext[]
        | null) ?? [],
    error: null,
  };
}

export async function fetchChampionshipCorrectedGroupStandings(
  championship_id: string,
  season_year?: number | null,
): Promise<{
  data: ChampionshipCorrectedGroupStanding[];
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "get_championship_corrected_group_standings",
    {
      _championship_id: championship_id,
      _season_year: season_year ?? null,
    },
  );

  if (response.error) {
    return {
      data: [],
      error: response.error,
    };
  }

  const normalizedRows = (
    (response.data as ChampionshipCorrectedGroupStanding[] | null) ?? []
  ).map((row) => ({
    ...row,
    wins: Number(row.wins),
    points_base: Number(row.points_base),
    correction_factor: Number(row.correction_factor),
    corrected_points: Number(row.corrected_points),
    goals_for: Number(row.goals_for),
    goals_against: Number(row.goals_against),
    goal_diff: Number(row.goal_diff),
    yellow_cards: Number(row.yellow_cards),
    red_cards: Number(row.red_cards),
    blue_cards: Number(row.blue_cards ?? 0),
    two_minute_penalties: Number(row.two_minute_penalties ?? 0),
    points_average: Number(row.points_average),
  }));

  return {
    data: normalizedRows,
    error: null,
  };
}

export async function saveChampionshipBracketTieBreakResolution(
  payload: ChampionshipBracketTieBreakResolutionSaveInput,
): Promise<{ data: string | null; error: Error | null }> {
  const response = await supabase.rpc(
    "save_championship_bracket_tie_break_resolution",
    {
      _payload: {
        context_key: payload.context_key,
        competition_id: payload.competition_id,
        context_type: payload.context_type,
        group_id: payload.group_id ?? null,
        qualification_rank: payload.qualification_rank ?? null,
        team_ids: payload.team_ids,
      },
    },
  );

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

  const data =
    (response.data as unknown as ChampionshipBracketView | null) ?? null;

  if (!data || data.competitions.length == 0) {
    return {
      data,
      error: null,
    };
  }

  const competitionIds = data.competitions.map((competition) => competition.id);
  const pairingModesResponse = await supabase
    .from("championship_bracket_competitions")
    .select("id, knockout_pairing_mode")
    .in("id", competitionIds);

  if (pairingModesResponse.error) {
    return {
      data,
      error: null,
    };
  }

  const knockoutPairingModeByCompetitionId = new Map<
    string,
    ChampionshipKnockoutPairingMode
  >(
    (pairingModesResponse.data ?? []).map((competition) => [
      competition.id,
      (competition.knockout_pairing_mode as ChampionshipKnockoutPairingMode | null) ??
        "LINEAR",
    ]),
  );

  return {
    data: {
      ...data,
      competitions: data.competitions.map((competition) => ({
        ...competition,
        knockout_pairing_mode:
          knockoutPairingModeByCompetitionId.get(competition.id) ??
          competition.knockout_pairing_mode ??
          "LINEAR",
      })),
    },
    error: null,
  };
}

export async function saveMatchSets(match_id: string, sets: MatchSetInput[]) {
  return supabase.rpc("save_match_sets", {
    _match_id: match_id,
    _sets: toSupabaseJson(sets),
  });
}

export async function fetchMatchSets(
  match_id: string,
): Promise<{ data: MatchSetInput[]; error: Error | null }> {
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
    data: (response.data as unknown as MatchSetInput[] | null) ?? [],
    error: null,
  };
}

export async function swapChampionshipKnockoutBracketTeams(
  competition_id: string,
  team_a_id: string,
  team_b_id: string,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc(
    "swap_championship_knockout_bracket_teams",
    {
      _competition_id: competition_id,
      _team_a_id: team_a_id,
      _team_b_id: team_b_id,
    },
  );
  return { error: response.error };
}

export async function getBracketDaySchedules(
  bracketEditionId: string,
): Promise<{ data: BracketDaySchedule[]; error: Error | null }> {
  const response = await supabase
    .from("championship_bracket_days")
    .select(
      `
      id,
      event_date,
      start_time,
      end_time,
      championship_bracket_locations (
        id,
        name,
        location_group_id,
        championship_bracket_courts (
          id,
          name,
          court_group_id
        )
      ),
      championship_bracket_day_breaks (
        id,
        bracket_day_id,
        break_start_time,
        break_end_time,
        position,
        scope_type,
        bracket_court_id
      )
    `,
    )
    .eq("bracket_edition_id", bracketEditionId)
    .order("event_date", { ascending: true });

  if (response.error) {
    return { data: [], error: response.error };
  }

  const data: BracketDaySchedule[] = (response.data ?? []).map((day) => {
    const rawDay = day as unknown as {
      id: string;
      event_date: string;
      start_time: string;
      end_time: string;
      championship_bracket_locations: Array<{
        id: string;
        name: string;
        location_group_id: string;
        championship_bracket_courts: Array<{
          id: string;
          name: string;
          court_group_id: string;
        }> | null;
      }> | null;
      championship_bracket_day_breaks: Array<{
        id: string;
        bracket_day_id: string;
        break_start_time: string;
        break_end_time: string;
        position: number;
        scope_type: "ALL_COURTS" | "COURT";
        bracket_court_id: string | null;
      }> | null;
    };

    const breaks = (rawDay.championship_bracket_day_breaks ?? []).sort(
      (a, b) => a.position - b.position,
    );
    const courts = (rawDay.championship_bracket_locations ?? []).flatMap(
      (location) =>
        (location.championship_bracket_courts ?? []).map((court) => ({
          id: court.id,
          court_group_id: court.court_group_id,
          name: court.name,
          location_name: location.name,
          label: `${location.name} • ${court.name}`,
        })),
    );

    return {
      id: rawDay.id,
      event_date: rawDay.event_date,
      start_time: rawDay.start_time,
      end_time: rawDay.end_time,
      breaks,
      courts,
    };
  });

  return { data, error: null };
}

export async function updateBracketDaySchedule(
  bracketEditionId: string,
  updates: BracketDayScheduleUpdate[],
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("update_bracket_day_schedule", {
    _bracket_edition_id: bracketEditionId,
    _schedule_updates: toSupabaseJson(updates),
  });
  return { error: response.error };
}

export async function updateBracketCompetitionSettings(
  competitionId: string,
  qualifiersPerGroup: number,
  shouldCompleteKnockoutWithBestSecondPlacedTeams: boolean,
  knockoutPairingMode: ChampionshipKnockoutPairingMode,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("update_bracket_competition_settings", {
    _competition_id: competitionId,
    _qualifiers_per_group: qualifiersPerGroup,
    _should_complete_knockout_with_best_second_placed_teams:
      shouldCompleteKnockoutWithBestSecondPlacedTeams,
    _knockout_pairing_mode: knockoutPairingMode,
  });
  return { error: response.error };
}

export async function listEditableMatchScheduleSlots(
  input: EditableMatchScheduleSlotQueryInput,
): Promise<{ data: EditableMatchScheduleSlot[]; error: Error | null }> {
  const response = await supabase.rpc("list_editable_match_schedule_slots", {
    _match_id: input.match_id,
    _target_date: input.target_date,
    _target_location: input.target_location,
    _target_court_name: input.target_court_name,
    _sport_id: input.sport_id ?? null,
    _naipe: input.naipe ?? null,
    _home_team_id: input.home_team_id ?? null,
    _away_team_id: input.away_team_id ?? null,
  });

  if (response.error) {
    return { data: [], error: response.error };
  }

  return {
    data: (response.data as EditableMatchScheduleSlot[] | null) ?? [],
    error: null,
  };
}

export async function updateScheduledMatchLogistics(
  input: ScheduledMatchLogisticsUpdateInput,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("update_scheduled_match_logistics", {
    _match_id: input.match_id,
    _scheduled_date: input.scheduled_date,
    _location: input.location,
    _court_name: input.court_name,
    _slot_start_time: input.slot_start_time,
    _representation_mode: input.representation_mode,
    _sport_id: input.sport_id ?? null,
    _naipe: input.naipe ?? null,
    _home_team_id: input.home_team_id ?? null,
    _away_team_id: input.away_team_id ?? null,
  });

  return { error: response.error };
}

export async function getBracketCourtSports(
  bracketEditionId: string,
): Promise<{ data: BracketDayCourtSports[]; error: Error | null }> {
  const response = await supabase
    .from("championship_bracket_days")
    .select(
      `
      id,
      event_date,
      championship_bracket_locations (
        id,
        name,
        position,
        location_group_id,
        championship_bracket_courts (
          id,
          name,
          position,
          court_group_id,
          championship_bracket_court_sports (
            sport_id,
            preferred_naipe,
            preferred_division,
            sequence_mode
          )
        )
      )
    `,
    )
    .eq("bracket_edition_id", bracketEditionId)
    .order("event_date", { ascending: true });

  if (response.error) {
    return { data: [], error: response.error };
  }

  const data: BracketDayCourtSports[] = (response.data ?? []).map((day) => ({
    bracket_day_id: day.id,
    event_date: day.event_date,
    locations: (
      (day.championship_bracket_locations as unknown as Array<{
        id: string;
        name: string;
        position: number;
        location_group_id: string;
        championship_bracket_courts: Array<{
          id: string;
          name: string;
          position: number;
          court_group_id: string;
          championship_bracket_court_sports: Array<{
            sport_id: string;
            preferred_naipe: string | null;
            preferred_division: string | null;
            sequence_mode: ChampionshipBracketCourtSequenceMode;
          }>;
        }>;
      }>) ?? []
    )
      .map((location) => ({
        id: location.id,
        name: location.name,
        position: location.position,
        location_group_id: location.location_group_id,
        courts: (location.championship_bracket_courts ?? [])
          .map((court) => ({
            id: court.id,
            name: court.name,
            position: court.position,
            court_group_id: court.court_group_id,
            sports: (court.championship_bracket_court_sports ?? []).map(
              (courtSport) => ({
                sport_id: courtSport.sport_id,

                preferred_naipe:
                  (courtSport.preferred_naipe as MatchNaipe | null) ?? null,

                preferred_division:
                  (courtSport.preferred_division as TeamDivision | null) ??
                  null,

                sequence_mode: courtSport.sequence_mode,
              }),
            ),
          }))
          .sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => a.position - b.position),
  }));

  return { data, error: null };
}

export async function updateBracketCourtPriorities(
  bracketEditionId: string,
  items: BracketCourtPriorityUpdate[],
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("update_bracket_court_priorities", {
    _bracket_edition_id: bracketEditionId,
    _court_priorities: toSupabaseJson(items),
  });
  return { error: response.error };
}

export async function getBracketLocationSportPriorities(
  bracketEditionId: string,
): Promise<{ data: BracketLocationSportPriorityGroup[]; error: Error | null }> {
  const [daysResponse, prioritiesResponse] = await Promise.all([
    supabase
      .from("championship_bracket_days")
      .select(
        `
        id,
        event_date,
        championship_bracket_locations (
          id,
          name,
          position,
          location_group_id,
          championship_bracket_courts (
            id,
            name,
            position,
            court_group_id,
            championship_bracket_court_sports (
              sport_id,
              sequence_mode
            )
          )
        )
      `,
      )
      .eq("bracket_edition_id", bracketEditionId)
      .order("event_date", { ascending: true }),
    supabase
      .from("championship_bracket_location_sport_priorities")
      .select("location_group_id, sport_id, priority_mode")
      .eq("bracket_edition_id", bracketEditionId),
  ]);

  if (daysResponse.error) {
    return { data: [], error: daysResponse.error };
  }

  if (prioritiesResponse.error) {
    return { data: [], error: prioritiesResponse.error };
  }

  const priorityModeByKey = (
    (prioritiesResponse.data as Array<{
      location_group_id: string;
      sport_id: string;
      priority_mode: BracketLocationSportPriorityGroup["priority_mode"];
    }> | null) ?? []
  ).reduce<Record<string, BracketLocationSportPriorityGroup["priority_mode"]>>(
    (carry, item) => {
      carry[`${item.location_group_id}:${item.sport_id}`] = item.priority_mode;
      return carry;
    },
    {},
  );

  const grouped = new Map<string, BracketLocationSportPriorityGroup>();
  const orderedDays =
    (daysResponse.data as Array<{
      championship_bracket_locations?: Array<{
        id: string;
        name: string;
        position: number;
        location_group_id: string;
        championship_bracket_courts?: Array<{
          id: string;
          name: string;
          position: number;
          court_group_id: string;
          championship_bracket_court_sports?: Array<{
            sport_id: string;
            sequence_mode: ChampionshipBracketCourtSequenceMode;
          }>;
        }>;
      }>;
    }> | null) ?? [];

  orderedDays.forEach((day) => {
    (day.championship_bracket_locations ?? []).forEach((location) => {
      const uniqueSportIds = [
        ...new Set(
          (location.championship_bracket_courts ?? []).flatMap((court) =>
            (court.championship_bracket_court_sports ?? []).map(
              (courtSport) => courtSport.sport_id,
            ),
          ),
        ),
      ];

      uniqueSportIds.forEach((sportId) => {
        const key = `${location.location_group_id}:${sportId}`;
        const matchingCourts = (location.championship_bracket_courts ?? [])
          .filter((court) =>
            (court.championship_bracket_court_sports ?? []).some(
              (courtSport) => courtSport.sport_id === sportId,
            ),
          )
          .sort(
            (leftCourt, rightCourt) => leftCourt.position - rightCourt.position,
          );

        if (matchingCourts.length < 2) {
          return;
        }

        if (!grouped.has(key)) {
          grouped.set(key, {
            location_group_id: location.location_group_id,
            location_name: location.name,
            sport_id: sportId,
            priority_mode: priorityModeByKey[key] ?? "NONE",
            courts: [],
          });
        }

        const currentGroup = grouped.get(key);

        if (!currentGroup) {
          return;
        }

        matchingCourts.forEach((court) => {
          const sequenceModes = [
            ...new Set(
              (court.championship_bracket_court_sports ?? [])
                .filter((courtSport) => courtSport.sport_id === sportId)
                .map((courtSport) => courtSport.sequence_mode),
            ),
          ];

          const existingCourt = currentGroup.courts.find(
            (currentCourt) =>
              currentCourt.court_group_id === court.court_group_id,
          );

          if (existingCourt) {
            const mergedSequenceModes = [
              ...new Set([...existingCourt.sequence_modes, ...sequenceModes]),
            ];

            existingCourt.sequence_modes = mergedSequenceModes;

            existingCourt.is_sequence_locked = mergedSequenceModes.some(
              (mode) => mode !== "FLEXIBLE",
            );

            return;
          }

          currentGroup.courts.push({
            court_group_id: court.court_group_id,
            court_name: court.name,
            position: court.position,
            sequence_modes: sequenceModes,
            is_sequence_locked: sequenceModes.some(
              (mode) => mode !== "FLEXIBLE",
            ),
          });
        });
      });
    });
  });

  return {
    data: [...grouped.values()]
      .map((group) => ({
        ...group,
        courts: [...group.courts].sort(
          (leftCourt, rightCourt) => leftCourt.position - rightCourt.position,
        ),
      }))
      .sort((leftGroup, rightGroup) => {
        if (leftGroup.location_name === rightGroup.location_name) {
          return leftGroup.sport_id.localeCompare(rightGroup.sport_id);
        }

        return leftGroup.location_name.localeCompare(
          rightGroup.location_name,
          "pt-BR",
          { sensitivity: "base" },
        );
      }),
    error: null,
  };
}

export async function updateBracketLocationSportPriorities(
  bracketEditionId: string,
  items: BracketLocationSportPriorityUpdate[],
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc(
    "update_bracket_location_sport_priorities",
    {
      _bracket_edition_id: bracketEditionId,
      _priority_updates: toSupabaseJson(items),
    },
  );

  return { error: response.error };
}

export async function getBracketKnockoutCourtPriorities(
  bracketEditionId: string,
): Promise<{ data: BracketKnockoutCourtPriorityGroup[]; error: Error | null }> {
  const [daysResponse, competitionsResponse, prioritiesResponse] =
    await Promise.all([
      supabase
        .from("championship_bracket_days")
        .select(
          `
        championship_bracket_locations (
          id,
          name,
          position,
          location_group_id,
          championship_bracket_courts (
            id,
            name,
            position,
            court_group_id,
            championship_bracket_court_sports (
              sport_id
            )
          )
        )
      `,
        )
        .eq("bracket_edition_id", bracketEditionId),
      supabase
        .from("championship_bracket_competitions")
        .select("sport_id, division")
        .eq("bracket_edition_id", bracketEditionId),
      supabase
        .from("championship_bracket_knockout_court_priorities")
        .select(
          "sport_id, phase, division_scope, location_group_id, court_group_id",
        )
        .eq("bracket_edition_id", bracketEditionId),
    ]);

  if (daysResponse.error) {
    return { data: [], error: daysResponse.error };
  }

  if (competitionsResponse.error) {
    return { data: [], error: competitionsResponse.error };
  }

  if (prioritiesResponse.error) {
    return { data: [], error: prioritiesResponse.error };
  }

  const courtOptionsBySportId = new Map<
    string,
    BracketKnockoutCourtPriorityGroup["courts"]
  >();
  const rawDays =
    (daysResponse.data as Array<{
      championship_bracket_locations?: Array<{
        name: string;
        position: number;
        location_group_id: string;
        championship_bracket_courts?: Array<{
          name: string;
          position: number;
          court_group_id: string;
          championship_bracket_court_sports?: Array<{
            sport_id: string;
          }>;
        }>;
      }>;
    }> | null) ?? [];

  rawDays.forEach((day) => {
    (day.championship_bracket_locations ?? []).forEach((location) => {
      (location.championship_bracket_courts ?? []).forEach((court) => {
        const sportIds = [
          ...new Set(
            (court.championship_bracket_court_sports ?? []).map(
              (courtSport) => courtSport.sport_id,
            ),
          ),
        ];

        sportIds.forEach((sportId) => {
          const currentOptions = courtOptionsBySportId.get(sportId) ?? [];

          if (
            currentOptions.some(
              (option) => option.court_group_id === court.court_group_id,
            )
          ) {
            return;
          }

          courtOptionsBySportId.set(sportId, [
            ...currentOptions,
            {
              location_group_id: location.location_group_id,
              location_name: location.name,
              location_position: location.position,
              court_group_id: court.court_group_id,
              court_name: court.name,
              court_position: court.position,
            },
          ]);
        });
      });
    });
  });

  const orderedSportIds = [
    ...new Set(
      (competitionsResponse.data ?? []).map(
        (competition) => competition.sport_id,
      ),
    ),
  ]
    .filter((sportId) => (courtOptionsBySportId.get(sportId)?.length ?? 0) > 0)
    .sort((leftSportId, rightSportId) =>
      leftSportId.localeCompare(rightSportId),
    );

  const divisionsBySportId = (
    (competitionsResponse.data as Array<{
      sport_id: string;
      division: TeamDivision | null;
    }> | null) ?? []
  ).reduce<Record<string, TeamDivision[]>>((carry, competition) => {
    if (competition.division == null) {
      return carry;
    }

    const currentDivisions = carry[competition.sport_id] ?? [];

    if (!currentDivisions.includes(competition.division)) {
      carry[competition.sport_id] = [...currentDivisions, competition.division];
    }

    return carry;
  }, {});

  const priorityByKey = (
    (prioritiesResponse.data as Array<{
      sport_id: string;
      phase: BracketKnockoutCourtPriorityGroup["phase"];
      division_scope: BracketKnockoutCourtPriorityGroup["division_scope"];
      location_group_id: string | null;
      court_group_id: string | null;
    }> | null) ?? []
  ).reduce<
    Record<
      string,
      {
        location_group_id: string | null;
        court_group_id: string | null;
      }
    >
  >((carry, priority) => {
    carry[`${priority.sport_id}:${priority.phase}:${priority.division_scope}`] =
      {
        location_group_id: priority.location_group_id,
        court_group_id: priority.court_group_id,
      };
    return carry;
  }, {});

  const data = orderedSportIds.flatMap<BracketKnockoutCourtPriorityGroup>(
    (sportId) => {
      const courts = [...(courtOptionsBySportId.get(sportId) ?? [])].sort(
        (leftCourt, rightCourt) => {
          if (leftCourt.location_position !== rightCourt.location_position) {
            return leftCourt.location_position - rightCourt.location_position;
          }

          if (leftCourt.court_position !== rightCourt.court_position) {
            return leftCourt.court_position - rightCourt.court_position;
          }

          return `${leftCourt.location_name}:${leftCourt.court_name}`.localeCompare(
            `${rightCourt.location_name}:${rightCourt.court_name}`,
            "pt-BR",
            { sensitivity: "base" },
          );
        },
      );
      const sportDivisions = divisionsBySportId[sportId] ?? [];
      const semifinalScopes: BracketKnockoutCourtPriorityGroup["division_scope"][] =
        sportDivisions.length > 0 ? sportDivisions : ["ALL"];

      const semifinalGroups = semifinalScopes.map((divisionScope) => {
        const priority = priorityByKey[`${sportId}:SEMIFINAL:${divisionScope}`];

        return {
          sport_id: sportId,
          phase: "SEMIFINAL" as const,
          division_scope: divisionScope,
          location_group_id: priority?.location_group_id ?? null,
          court_group_id: priority?.court_group_id ?? null,
          courts,
        };
      });

      const finalPriority = priorityByKey[`${sportId}:FINAL:ALL`];

      return [
        ...semifinalGroups,
        {
          sport_id: sportId,
          phase: "FINAL" as const,
          division_scope: "ALL" as const,
          location_group_id: finalPriority?.location_group_id ?? null,
          court_group_id: finalPriority?.court_group_id ?? null,
          courts,
        },
      ];
    },
  );

  return { data, error: null };
}

export async function updateBracketKnockoutCourtPriorities(
  bracketEditionId: string,
  items: BracketKnockoutCourtPriorityUpdate[],
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc(
    "update_bracket_knockout_court_priorities",
    {
      _bracket_edition_id: bracketEditionId,
      _priority_updates: toSupabaseJson(items),
    },
  );

  return { error: response.error };
}

export async function getBracketGeneratedLocationGroups(
  bracketEditionId: string,
): Promise<{ data: BracketGeneratedLocationGroup[]; error: Error | null }> {
  const response = await supabase
    .from("championship_bracket_days")
    .select(
      `
      event_date,
      championship_bracket_locations (
        id,
        name,
        position,
        location_group_id,
        championship_bracket_courts (
          id,
          name,
          position,
          court_group_id
        )
      )
    `,
    )
    .eq("bracket_edition_id", bracketEditionId)
    .order("event_date", { ascending: true });

  if (response.error) {
    return { data: [], error: response.error };
  }

  const groups = new Map<string, BracketGeneratedLocationGroup>();
  const days =
    (response.data as Array<{
      championship_bracket_locations?: Array<{
        name: string;
        position: number;
        location_group_id: string;
        championship_bracket_courts?: Array<{
          name: string;
          position: number;
          court_group_id: string;
        }>;
      }>;
    }> | null) ?? [];

  days.forEach((day) => {
    (day.championship_bracket_locations ?? []).forEach((location) => {
      if (!groups.has(location.location_group_id)) {
        groups.set(location.location_group_id, {
          location_group_id: location.location_group_id,
          location_name: location.name,
          position: location.position,
          courts: [],
        });
      }

      const currentGroup = groups.get(location.location_group_id);

      if (!currentGroup) {
        return;
      }

      (location.championship_bracket_courts ?? [])
        .sort(
          (leftCourt, rightCourt) => leftCourt.position - rightCourt.position,
        )
        .forEach((court) => {
          if (
            currentGroup.courts.some(
              (existingCourt) =>
                existingCourt.court_group_id === court.court_group_id,
            )
          ) {
            return;
          }

          currentGroup.courts.push({
            court_group_id: court.court_group_id,
            court_name: court.name,
            position: court.position,
          });
        });
    });
  });

  return {
    data: [...groups.values()]
      .map((group) => ({
        ...group,
        courts: [...group.courts].sort(
          (leftCourt, rightCourt) => leftCourt.position - rightCourt.position,
        ),
      }))
      .sort(
        (leftGroup, rightGroup) => leftGroup.position - rightGroup.position,
      ),
    error: null,
  };
}

export async function updateBracketGeneratedLocationGroup(
  bracketEditionId: string,
  payload: BracketGeneratedLocationGroupUpdate,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc(
    "update_bracket_generated_location_group",
    {
      _bracket_edition_id: bracketEditionId,
      _payload: toSupabaseJson(payload),
    },
  );

  return { error: response.error };
}
