import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  ChampionshipCorrectedGroupStanding,
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketLocationTemplateSaveInput,
  ChampionshipBracketPreviewDay,
  ChampionshipBracketPreviewJob,
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
  BracketKnockoutProgrammedFinal,
  BracketKnockoutCourtPriorityUpdate,
  BracketGeneratedLocationGroup,
  BracketGeneratedLocationGroupUpdate,
  EditableMatchScheduleSlot,
  EditableMatchScheduleSlotQueryInput,
  ScheduledMatchLogisticsUpdateInput,
  ManualMatchRelocationInput,
  ManualMatchRelocationPreview,
  ManualMatchRelocationSlotPreview,
  HoldMatchesForManualRelocationInput,
  DayScheduleReorganizationInput,
  DayScheduleReorganizationPreview,
  OperationalKnockoutScheduleAdjustmentCandidates,
  OperationalKnockoutScheduleAdjustmentInput,
  OperationalKnockoutScheduleAdjustmentPreview,
  ChampionshipBracketReconfigurationAction,
  ChampionshipBracketReconfigurationPreview,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  resolveCompetitionKnockoutPairingModeValue,
  type ChampionshipKnockoutPairingMode,
} from "@/domain/championship-brackets/championshipBracketPairing";
import { resolveBracketDaySchedules } from "@/domain/championship-brackets/championshipBracketSchedule.utils";
import type { ChampionshipBracketView } from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";

function toSupabaseJson(value: unknown): Json {
  return value as Json;
}

function resolveScheduleDateKey(scheduledDate: string): string {
  return scheduledDate.slice(0, 10);
}

function normalizeKnockoutCourtIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function resolveKnockoutCourtLogicalKey(
  locationName: string,
  courtName: string,
): string {
  return [
    normalizeKnockoutCourtIdentity(locationName),
    normalizeKnockoutCourtIdentity(courtName),
  ].join("::");
}

export async function previewChampionshipBracketReconfiguration(
  bracketEditionId: string,
  action: ChampionshipBracketReconfigurationAction,
  payload: Record<string, unknown>,
): Promise<{
  data: ChampionshipBracketReconfigurationPreview | null;
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "preview_championship_bracket_reconfiguration",
    {
      _bracket_edition_id: bracketEditionId,
      _action: action,
      _payload: toSupabaseJson(payload),
    },
  );

  return {
    data:
      (response.data as unknown as ChampionshipBracketReconfigurationPreview | null) ??
      null,
    error: response.error,
  };
}

export async function applyChampionshipBracketReconfiguration(
  bracketEditionId: string,
  action: ChampionshipBracketReconfigurationAction,
  payload: Record<string, unknown>,
  expectedRevision: number,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc(
    "apply_championship_bracket_reconfiguration",
    {
      _bracket_edition_id: bracketEditionId,
      _action: action,
      _payload: toSupabaseJson(payload),
      _expected_revision: expectedRevision,
    },
  );

  return { error: response.error };
}

export async function previewManualMatchRelocation(
  bracketEditionId: string,
  input: ManualMatchRelocationInput,
): Promise<{ data: ManualMatchRelocationPreview | null; error: Error | null }> {
  const response = await supabase.rpc("preview_manual_match_relocation", {
    _bracket_edition_id: bracketEditionId,
    _payload: toSupabaseJson(input),
  });

  return {
    data: (response.data as unknown as ManualMatchRelocationPreview | null) ?? null,
    error: response.error,
  };
}

export async function applyManualMatchRelocation(
  bracketEditionId: string,
  input: ManualMatchRelocationInput,
  expectedRevision: number,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("apply_manual_match_relocation", {
    _bracket_edition_id: bracketEditionId,
    _payload: toSupabaseJson(input),
    _expected_revision: expectedRevision,
  });

  return { error: response.error };
}

export async function previewManualMatchRelocationSlot(
  bracketEditionId: string,
  input: ManualMatchRelocationInput,
): Promise<{
  data: ManualMatchRelocationSlotPreview | null;
  error: Error | null;
}> {
  const response = await supabase.rpc("preview_manual_match_relocation_slot", {
    _bracket_edition_id: bracketEditionId,
    _payload: toSupabaseJson(input),
  });

  return {
    data:
      (response.data as unknown as ManualMatchRelocationSlotPreview | null) ??
      null,
    error: response.error,
  };
}

export async function applyManualMatchRelocationSlot(
  bracketEditionId: string,
  input: ManualMatchRelocationInput,
  expectedRevision: number,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("apply_manual_match_relocation_slot", {
    _bracket_edition_id: bracketEditionId,
    _payload: toSupabaseJson(input),
    _expected_revision: expectedRevision,
  });

  return { error: response.error };
}

export async function holdMatchesForManualRelocation(
  bracketEditionId: string,
  input: HoldMatchesForManualRelocationInput,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("hold_matches_for_manual_relocation", {
    _bracket_edition_id: bracketEditionId,
    _payload: toSupabaseJson(input),
  });

  return { error: response.error };
}

export async function previewDayScheduleReorganization(
  bracketEditionId: string,
  input: DayScheduleReorganizationInput,
): Promise<{
  data: DayScheduleReorganizationPreview | null;
  error: Error | null;
}> {
  const response = await supabase.rpc("preview_day_schedule_reorganization", {
    _bracket_edition_id: bracketEditionId,
    _payload: toSupabaseJson(input),
  });

  return {
    data:
      (response.data as unknown as DayScheduleReorganizationPreview | null) ??
      null,
    error: response.error,
  };
}

export async function applyDayScheduleReorganization(
  bracketEditionId: string,
  input: DayScheduleReorganizationInput,
  expectedRevision: number,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc("apply_day_schedule_reorganization", {
    _bracket_edition_id: bracketEditionId,
    _payload: toSupabaseJson(input),
    _expected_revision: expectedRevision,
  });

  return { error: response.error };
}

export async function listOperationalKnockoutScheduleAdjustmentCandidates(
  sourceBracketMatchId: string,
): Promise<{
  data: OperationalKnockoutScheduleAdjustmentCandidates | null;
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "list_operational_knockout_schedule_adjustment_candidates",
    {
      _source_bracket_match_id: sourceBracketMatchId,
    },
  );

  return {
    data:
      (response.data as unknown as OperationalKnockoutScheduleAdjustmentCandidates | null) ??
      null,
    error: response.error,
  };
}

export async function previewOperationalKnockoutScheduleAdjustment(
  bracketEditionId: string,
  input: OperationalKnockoutScheduleAdjustmentInput,
): Promise<{
  data: OperationalKnockoutScheduleAdjustmentPreview | null;
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "preview_operational_knockout_schedule_adjustment",
    {
      _bracket_edition_id: bracketEditionId,
      _payload: toSupabaseJson(input),
    },
  );

  return {
    data:
      (response.data as unknown as OperationalKnockoutScheduleAdjustmentPreview | null) ??
      null,
    error: response.error,
  };
}

export async function applyOperationalKnockoutScheduleAdjustment(
  bracketEditionId: string,
  input: OperationalKnockoutScheduleAdjustmentInput,
  expectedRevision: number,
): Promise<{ error: Error | null }> {
  const response = await supabase.rpc(
    "apply_operational_knockout_schedule_adjustment",
    {
      _bracket_edition_id: bracketEditionId,
      _payload: toSupabaseJson(input),
      _expected_revision: expectedRevision,
    },
  );

  return { error: response.error };
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

function normalizeChampionshipBracketPreviewJob(
  value: unknown,
): ChampionshipBracketPreviewJob | null {
  if (!value || typeof value != "object" || Array.isArray(value)) return null;
  return value as ChampionshipBracketPreviewJob;
}

export async function createChampionshipBracketFromPreviewJob(
  championship_id: string,
  payload: ChampionshipBracketSetupFormValues,
  job_id: string,
) {
  return supabase.rpc("create_championship_bracket_from_preview_job", {
    _job_id: job_id,
    _championship_id: championship_id,
    _payload: toSupabaseJson(payload),
  });
}

export async function startChampionshipBracketPreviewJob(
  championship_id: string,
  payload: ChampionshipBracketSetupFormValues,
): Promise<{
  data: ChampionshipBracketPreviewJob | null;
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "start_championship_bracket_preview_job",
    {
      _championship_id: championship_id,
      _payload: toSupabaseJson(payload),
    },
  );

  if (response.error) {
    return {
      data: null,
      error: response.error,
    };
  }

  return {
    data: normalizeChampionshipBracketPreviewJob(response.data),
    error: null,
  };
}

export async function fetchChampionshipBracketPreviewJobStatus(job_id: string) {
  const response = await supabase.rpc(
    "get_championship_bracket_preview_job_status",
    { _job_id: job_id },
  );
  return {
    data: normalizeChampionshipBracketPreviewJob(response.data),
    error: response.error,
  };
}

export async function fetchChampionshipBracketPreviewJobDay(
  job_id: string,
  date: string,
): Promise<{
  data: ChampionshipBracketPreviewDay | null;
  error: Error | null;
}> {
  const response = await supabase.rpc(
    "get_championship_bracket_preview_job_day",
    {
      _job_id: job_id,
      _date: date,
    },
  );
  return {
    data:
      (response.data as unknown as ChampionshipBracketPreviewDay | null) ??
      null,
    error: response.error,
  };
}

export async function cancelChampionshipBracketPreviewJob(job_id: string) {
  const response = await supabase.rpc(
    "cancel_championship_bracket_preview_job",
    {
      _job_id: job_id,
    },
  );
  return {
    data: normalizeChampionshipBracketPreviewJob(response.data),
    error: response.error,
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
      resolveCompetitionKnockoutPairingModeValue(
        competition.knockout_pairing_mode,
      ),
    ]),
  );

  return {
    data: {
      ...data,
      competitions: data.competitions.map((competition) => ({
        ...competition,
        knockout_pairing_mode:
          knockoutPairingModeByCompetitionId.get(competition.id) ??
          resolveCompetitionKnockoutPairingModeValue(
            competition.knockout_pairing_mode,
          ),
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
  const [scheduleResponse, editionResponse] = await Promise.all([
    supabase
      .from("championship_bracket_days")
      .select(
        `
      id,
      event_date,
      start_time,
      end_time,
      break_start_time,
      break_end_time,
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
      .order("event_date", { ascending: true }),
    supabase
      .from("championship_bracket_editions")
      .select("payload_snapshot")
      .eq("id", bracketEditionId)
      .maybeSingle(),
  ]);

  if (scheduleResponse.error) {
    return { data: [], error: scheduleResponse.error };
  }

  return {
    data: resolveBracketDaySchedules(
      scheduleResponse.data ?? [],
      editionResponse.data?.payload_snapshot,
    ),
    error: null,
  };
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
            sequence_mode,
            alternate_naipe_after_exclusive_knockout_phase
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
            alternate_naipe_after_exclusive_knockout_phase: boolean;
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

                alternate_naipe_after_exclusive_knockout_phase:
                  courtSport.alternate_naipe_after_exclusive_knockout_phase ===
                  true,
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
  const [daysResponse, prioritiesResponse, bracketMatchesResponse] =
    await Promise.all([
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
            preferred_sport_id,
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
      .order("event_date", { ascending: true }),
    supabase
      .from("championship_bracket_location_sport_priorities")
      .select("location_group_id, sport_id, priority_mode")
      .eq("bracket_edition_id", bracketEditionId),
    supabase
      .from("championship_bracket_matches")
      .select(
        `
        match_id,
        matches!championship_bracket_matches_match_id_fkey (
          scheduled_date,
          sport_id
        )
      `,
      )
      .eq("bracket_edition_id", bracketEditionId)
      .not("match_id", "is", null),
  ]);

  if (daysResponse.error) {
    return { data: [], error: daysResponse.error };
  }

  if (prioritiesResponse.error) {
    return { data: [], error: prioritiesResponse.error };
  }

  if (bracketMatchesResponse.error) {
    return { data: [], error: bracketMatchesResponse.error };
  }

  const activeSportDateKeys = new Set(
    (
      bracketMatchesResponse.data as Array<{
        match_id: string | null;
        matches: {
          scheduled_date: string | null;
          sport_id: string | null;
        } | null;
      }> | null
    )
      ?.map((item) => item.matches)
      .filter(
        (
          match,
        ): match is {
          scheduled_date: string;
          sport_id: string;
        } => match?.scheduled_date != null && match.sport_id != null,
      )
      .map(
        (match) =>
          `${resolveScheduleDateKey(match.scheduled_date)}:${match.sport_id}`,
      ) ?? [],
  );

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
      id: string;
      event_date: string;
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
          preferred_sport_id: string | null;
          championship_bracket_court_sports?: Array<{
            sport_id: string;
            preferred_naipe: MatchNaipe | null;
            preferred_division: TeamDivision | null;
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
        const activeSportDateKey = `${day.event_date}:${sportId}`;

        if (!activeSportDateKeys.has(activeSportDateKey)) {
          return;
        }

        const key = `${day.id}:${location.location_group_id}:${sportId}`;
        const priorityKey = `${location.location_group_id}:${sportId}`;
        const matchingCourts = (location.championship_bracket_courts ?? [])
          .filter((court) =>
            court.preferred_sport_id === sportId &&
            (court.championship_bracket_court_sports ?? []).some(
              (courtSport) => courtSport.sport_id === sportId,
            ),
          )
          .sort(
            (leftCourt, rightCourt) => leftCourt.position - rightCourt.position,
          );

        if (matchingCourts.length === 0) {
          return;
        }

        if (!grouped.has(key)) {
          grouped.set(key, {
            bracket_day_id: day.id,
            event_date: day.event_date,
            location_group_id: location.location_group_id,
            location_name: location.name,
            sport_id: sportId,
            priority_mode: priorityModeByKey[priorityKey] ?? "NONE",
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

          const matchingCourtSports =
            (court.championship_bracket_court_sports ?? [])
              .filter(
                (courtSport) =>
                  courtSport.sport_id === sportId,
              );

          const matchingCourtSport =
            matchingCourtSports[0] ?? null;

          if (!matchingCourtSport) {
            return;
          }

          const preferredNaipe =
            matchingCourtSports.find(
              (courtSport) =>
                courtSport.preferred_naipe != null,
            )?.preferred_naipe ?? null;

          const preferredDivision =
            matchingCourtSports.find(
              (courtSport) =>
                courtSport.preferred_division != null,
            )?.preferred_division ?? null;

          const existingCourt = currentGroup.courts.find(
            (currentCourt) =>
              currentCourt.court_group_id === court.court_group_id,
          );

          if (existingCourt) {
            const mergedSequenceModes = [
              ...new Set([...existingCourt.sequence_modes, ...sequenceModes]),
            ];

            existingCourt.sequence_modes = mergedSequenceModes;

            existingCourt.is_sequence_locked = false;

            existingCourt.preferred_naipe =
              existingCourt.preferred_naipe ??
              preferredNaipe;

            existingCourt.preferred_division =
              existingCourt.preferred_division ??
              preferredDivision;

            return;
          }

          currentGroup.courts.push({
            bracket_court_id: court.id,
            court_group_id: court.court_group_id,
            court_name: court.name,
            position: court.position,
            preferred_sport_id: court.preferred_sport_id ?? null,
            is_primary_sport: court.preferred_sport_id === sportId,
            preferred_naipe: preferredNaipe,
            preferred_division: preferredDivision,
            sequence_mode: matchingCourtSport.sequence_mode,
            sequence_modes: sequenceModes,
            is_sequence_locked: false,
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
  const [
    daysResponse,
    competitionsResponse,
    prioritiesResponse,
    finalProgramResponse,
  ] =
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
      supabase.rpc("get_admin_championship_knockout_final_program_schedule", {
        _bracket_edition_id: bracketEditionId,
      }),
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

  if (finalProgramResponse.error) {
    return { data: [], error: finalProgramResponse.error };
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
          const logicalKey = resolveKnockoutCourtLogicalKey(
            location.name,
            court.name,
          );
          const existingOptionIndex = currentOptions.findIndex(
            (option) => option.logical_key === logicalKey,
          );

          if (existingOptionIndex >= 0) {
            const existingOption = currentOptions[existingOptionIndex];
            const nextOptions = [...currentOptions];

            nextOptions[existingOptionIndex] = {
              ...existingOption,
              location_group_ids: [
                ...new Set([
                  ...existingOption.location_group_ids,
                  location.location_group_id,
                ]),
              ],
              court_group_ids: [
                ...new Set([
                  ...existingOption.court_group_ids,
                  court.court_group_id,
                ]),
              ],
              location_position: Math.min(
                existingOption.location_position,
                location.position,
              ),
              court_position: Math.min(
                existingOption.court_position,
                court.position,
              ),
            };

            courtOptionsBySportId.set(sportId, nextOptions);
            return;
          }

          courtOptionsBySportId.set(sportId, [
            ...currentOptions,
            {
              logical_key: logicalKey,
              location_group_id: location.location_group_id,
              location_group_ids: [location.location_group_id],
              location_name: location.name,
              location_position: location.position,
              court_group_id: court.court_group_id,
              court_group_ids: [court.court_group_id],
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

  const programmedFinalsBySportId = (
    (finalProgramResponse.data as Array<{
      sport_id: string;
      scheduled_date: string;
      location_name: string;
      court_name: string;
      location_group_id: string;
      court_group_id: string;
    }> | null) ?? []
  ).reduce<Record<string, BracketKnockoutProgrammedFinal[]>>(
    (carry, finalProgram) => {
      const currentFinals = carry[finalProgram.sport_id] ?? [];
      const alreadyExists = currentFinals.some(
        (existingFinal) =>
          existingFinal.scheduled_date === finalProgram.scheduled_date &&
          existingFinal.location_group_id === finalProgram.location_group_id &&
          existingFinal.court_group_id === finalProgram.court_group_id,
      );

      if (alreadyExists) {
        return carry;
      }

      carry[finalProgram.sport_id] = [
        ...currentFinals,
        {
          scheduled_date: finalProgram.scheduled_date,
          location_name: finalProgram.location_name,
          court_name: finalProgram.court_name,
          location_group_id: finalProgram.location_group_id,
          court_group_id: finalProgram.court_group_id,
        },
      ];

      return carry;
    },
    {},
  );

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
      const resolveAutomaticCourt = (
        phase: BracketKnockoutCourtPriorityGroup["phase"],
        divisionScope: BracketKnockoutCourtPriorityGroup["division_scope"],
      ) => {
        if (courts.length === 0) {
          return null;
        }

        if (
          phase === "SEMIFINAL" &&
          divisionScope === "DIVISAO_ACESSO" &&
          courts.length > 1
        ) {
          return courts[1];
        }

        return courts[0];
      };
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
          automatic_court: resolveAutomaticCourt("SEMIFINAL", divisionScope),
          programmed_finals: programmedFinalsBySportId[sportId] ?? [],
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
          automatic_court: resolveAutomaticCourt("FINAL", "ALL"),
          programmed_finals: programmedFinalsBySportId[sportId] ?? [],
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
