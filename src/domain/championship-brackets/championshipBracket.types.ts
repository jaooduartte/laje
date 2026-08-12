import type {
  BracketThirdPlaceMode,
  ChampionshipSchedulePeriod,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipBracketTieBreakContextType,
  MatchManualRepresentationMode,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import type { ChampionshipKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";

export interface ChampionshipSeasonSettingsInput {
  division_format: ChampionshipSeasonDivisionFormat;
  division_settlement_mode: ChampionshipSeasonDivisionSettlementMode;
  principal_slots_count: number | null;
  principal_relegation_count: number | null;
  access_promotion_count: number | null;
}

export interface ChampionshipBracketParticipantModalityInput {
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
}

export interface ChampionshipBracketParticipantInput {
  team_id: string;
  modalities: ChampionshipBracketParticipantModalityInput[];
}

export interface ChampionshipBracketGroupInput {
  group_number: number;
  team_ids: string[];
}

export interface ChampionshipBracketCompetitionInput {
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  groups_count: number;
  qualifiers_per_group: number;
  should_complete_knockout_with_best_second_placed_teams: boolean;
  knockout_pairing_mode: ChampionshipKnockoutPairingMode;
  third_place_mode: BracketThirdPlaceMode;
  groups: ChampionshipBracketGroupInput[];
}

export type ChampionshipBracketCourtSequenceMode =
  | "FLEXIBLE"
  | "GROUP_NAIPE"
  | "GROUP_DIVISION";

export type ChampionshipBracketMatchNumberingMode =
  | "COURT"
  | "SPORT_NAIPE"
  | "SPORT";

export interface ChampionshipBracketCourtSportPreferenceInput {
  preferred_sport_id: string;
  preferred_naipe: MatchNaipe | null;
  preferred_division: TeamDivision | null;
  sequence_mode: ChampionshipBracketCourtSequenceMode;
  alternate_naipe_after_exclusive_knockout_phase: boolean;
}

export type ChampionshipBracketCourtSportMatchTargetPlanningMode =
  | "MANUAL"
  | "AUTO";

export interface ChampionshipBracketCourtSportMatchTargetInput {
  sport_id: string;
  planned_match_count: number;
  planning_mode?: ChampionshipBracketCourtSportMatchTargetPlanningMode;
}

export interface ChampionshipBracketCourtInput {
  court_key: string;
  name: string;
  position: number;
  sport_ids: string[];
  sport_preference?: ChampionshipBracketCourtSportPreferenceInput | null;
  sport_match_targets?: ChampionshipBracketCourtSportMatchTargetInput[];
}

export interface ChampionshipBracketLocationInput {
  location_key: string;
  name: string;
  position: number;
  courts: ChampionshipBracketCourtInput[];
}

export interface ChampionshipBracketLocationTemplateCourt {
  id: string;
  name: string;
  position: number;
  sport_ids: string[];
}

export interface ChampionshipBracketLocationTemplate {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  courts: ChampionshipBracketLocationTemplateCourt[];
}

export interface ChampionshipBracketLocationTemplateSaveInput {
  id?: string | null;
  name: string;
  courts: ChampionshipBracketLocationTemplateCourt[];
}

export interface ChampionshipBracketScheduleDayInput {
  date: string;
  start_time: string;
  end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  locations: ChampionshipBracketLocationInput[];
}

export interface ChampionshipBracketSchedulePeriodInput {
  date: string;
  period: ChampionshipSchedulePeriod;
  enabled: boolean;
}

export interface ChampionshipBracketCompetitionPeriodAvailabilityInput {
  competition_key: string;
  date: string;
  period: ChampionshipSchedulePeriod;
  enabled: boolean;
}

export interface ChampionshipBracketTeamCompetitionAvailabilityInput {
  team_id: string;
  competition_key: string;
  date: string;
  period: ChampionshipSchedulePeriod;
  enabled: boolean;
}

export type ChampionshipBracketAvailabilityMode =
  | "UNAVAILABLE"
  | "FULL_DAY"
  | "CUSTOM";

export interface ChampionshipBracketAvailabilityWindowInput {
  start_time: string;
  end_time: string;
}

export interface ChampionshipBracketFixedTimeRangeInput {
  start_time: string;
  end_time: string;
}

export interface ChampionshipBracketCompetitionDateAvailabilityInput {
  competition_key: string;
  date: string;
  mode: ChampionshipBracketAvailabilityMode;
  windows: ChampionshipBracketAvailabilityWindowInput[];
}

export interface ChampionshipBracketTeamCompetitionDateAvailabilityInput {
  team_id: string;
  competition_key: string;
  date: string;
  mode: ChampionshipBracketAvailabilityMode;
  windows: ChampionshipBracketAvailabilityWindowInput[];
}

export interface ChampionshipBracketIndividualPlacementPointInput {
  placement: number;
  points: number | null;
}

export interface ChampionshipBracketIndividualEventConfigInput {
  sport_id: string;
  placements_count: number;
  placement_points: ChampionshipBracketIndividualPlacementPointInput[];
  relay_multiplier: number;
}

export interface ChampionshipBracketEnabledSportInput {
  sport_id: string;
}

export interface ChampionshipBracketIndividualSessionConfigInput {
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location_key: string | null;
  court_key: string | null;
  location_name: string | null;
  court_name: string | null;
  exclusive_lock_enabled: boolean;
}

export interface ChampionshipBracketResourceLockInput {
  date: string;
  start_time: string;
  end_time: string;
  location_key: string;
  court_key: string;
  location_name: string | null;
  court_name: string | null;
  lock_mode: "FLEXIBLE" | "HARD";
  competition_key?: string | null;
  sport_id?: string | null;
  naipe?: MatchNaipe | null;
  division?: TeamDivision | null;
}

export interface ChampionshipBracketKnockoutProgramBlockInput {
  date: string;
  start_time: string;
  end_time: string;
  location_key: string;
  court_key: string;
  location_name: string | null;
  court_name: string | null;
  sport_id: string;
  phase: "FINAL";
  division_scope: TeamDivision | "ALL";
  naipe_sequence: MatchNaipe[];
  match_duration_minutes_override: number | null;
  display_order: number;
}

export interface ChampionshipBracketSetupFormValues {
  season_settings: ChampionshipSeasonSettingsInput;
  enabled_sport_ids: string[];
  participants: ChampionshipBracketParticipantInput[];
  competitions: ChampionshipBracketCompetitionInput[];
  schedule_days: ChampionshipBracketScheduleDayInput[];
  competition_date_availability?: ChampionshipBracketCompetitionDateAvailabilityInput[];
  team_competition_date_availability?: ChampionshipBracketTeamCompetitionDateAvailabilityInput[];
  individual_event_configs: ChampionshipBracketIndividualEventConfigInput[];
  individual_session_configs: ChampionshipBracketIndividualSessionConfigInput[];
  resource_locks: ChampionshipBracketResourceLockInput[];
  match_numbering_mode: ChampionshipBracketMatchNumberingMode;
  knockout_program_blocks: ChampionshipBracketKnockoutProgramBlockInput[];
}

export type ChampionshipBracketPreviewTimelineEntryType =
  | "MATCH"
  | "BREAK"
  | "RESERVATION"
  | "INDIVIDUAL_SESSION"
  | "EMPTY";

export type ChampionshipBracketPreviewMatchKind =
  | "GROUP_STAGE"
  | "KNOCKOUT"
  | "MANUAL_FINAL";

export type ChampionshipBracketPreviewPhase =
  | "GROUP_STAGE"
  | "ROUND_OF_32"
  | "ROUND_OF_16"
  | "QUARTERFINAL"
  | "SEMIFINAL"
  | "FINAL";

export type ChampionshipBracketPreviewDiagnosticSeverity = "WARNING" | "ERROR";

export interface ChampionshipBracketPreviewDiagnostic {
  code: string;
  severity: ChampionshipBracketPreviewDiagnosticSeverity;
  message: string;
  date: string | null;
  location_name: string | null;
  court_name: string | null;
  sport_id: string | null;
  sport_name: string | null;
  naipe: MatchNaipe | null;
  division: TeamDivision | null;
  phase: ChampionshipBracketPreviewPhase | null;
}

export interface ChampionshipBracketPreviewTimelineEntry {
  type: ChampionshipBracketPreviewTimelineEntryType;
  start_time: string;
  end_time: string;
  duration_minutes: number;

  match_kind: ChampionshipBracketPreviewMatchKind | null;
  match_number: number | null;

  sport_id: string | null;
  sport_name: string | null;
  naipe: MatchNaipe | null;
  division: TeamDivision | null;

  phase: ChampionshipBracketPreviewPhase | null;
  phase_label: string | null;
  group_number: number | null;
  round_number: number | null;

  projected: boolean;
  manual_final: boolean;

  reason_code: string | null;
  reason: string | null;
}

export interface ChampionshipBracketPreviewCourt {
  court_key: string;
  court_name: string;
  occupied_minutes: number;
  available_minutes: number;
  utilization_percentage: number;
  free_windows: number;
  entries: ChampionshipBracketPreviewTimelineEntry[];
}

export interface ChampionshipBracketPreviewLocation {
  location_key: string;
  location_name: string;
  courts: ChampionshipBracketPreviewCourt[];
}

export interface ChampionshipBracketPreviewDay {
  date: string;
  start_time: string;
  end_time: string;
  occupied_minutes: number;
  available_minutes: number;
  utilization_percentage: number;
  free_windows: number;
  breaks: Array<{
    start_time: string;
    end_time: string;
  }>;
  locations: ChampionshipBracketPreviewLocation[];
}

export interface ChampionshipBracketPreviewGamesByDay {
  date: string;
  matches: number;
}

export interface ChampionshipBracketPreviewSummary {
  total_matches: number;
  group_stage_matches: number;
  knockout_matches: number;
  scheduled_matches: number;
  occupied_minutes: number;
  available_minutes: number;
  utilization_percentage: number;
  free_windows: number;
  conflict_count: number;
  warning_count: number;
  games_by_day: ChampionshipBracketPreviewGamesByDay[];
}

export interface ChampionshipBracketPreviewResult {
  ok: boolean;
  message: string | null;
  match_numbering_mode: ChampionshipBracketMatchNumberingMode;
  summary: ChampionshipBracketPreviewSummary | null;
  days: ChampionshipBracketPreviewDay[];
  diagnostics: ChampionshipBracketPreviewDiagnostic[];
}

export interface ChampionshipBracketExactPreviewCache {
  payload_signature: string;
  generated_at: string;
  result: ChampionshipBracketPreviewResult;
}

export interface ChampionshipBracketSportMatchTargetRecommendationLineCompetitionBreakdown {
  competition_key: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  planned_match_count: number;
}

export interface ChampionshipBracketSportMatchTargetRecommendationLine {
  key: string;
  schedule_day_id: string;
  schedule_day_date: string;
  location_id: string;
  court_id: string;
  sport_id: string;
  planning_mode: ChampionshipBracketCourtSportMatchTargetPlanningMode;
  manual_match_count: number;
  recommended_match_count: number;
  effective_match_count: number;
  free_minutes: number;
  reserved_minutes_before_line: number;
  remaining_minutes_after_line: number;
  additional_match_capacity: number;
  has_playable_window: boolean;
  required_match_count: number;
  resolved_match_count: number;
  shortage_match_count: number;
  excess_match_count: number;
  competition_breakdowns: ChampionshipBracketSportMatchTargetRecommendationLineCompetitionBreakdown[];
}

export interface ChampionshipBracketSportMatchTargetRecommendationSummary {
  sport_id: string;
  sport_name: string;
  required_match_count: number;
  resolved_match_count: number;
  shortage_match_count: number;
  excess_match_count: number;
}

export interface ChampionshipBracketCompetitionMatchTargetRecommendationSummary {
  competition_key: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  required_match_count: number;
  resolved_match_count: number;
  shortage_match_count: number;
  excess_match_count: number;
}

export interface ChampionshipBracketSportMatchTargetRecommendationResult {
  line_recommendations: ChampionshipBracketSportMatchTargetRecommendationLine[];
  sport_summaries: ChampionshipBracketSportMatchTargetRecommendationSummary[];
  competition_summaries: ChampionshipBracketCompetitionMatchTargetRecommendationSummary[];
}

export interface ChampionshipBracketReviewCollectiveCompetitionSummary {
  competition_key: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  expected_match_count: number;
}

export interface ChampionshipBracketReviewIndividualSessionSummary {
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  configured_session_count: number;
}

export interface ChampionshipBracketReviewConfigurationSummary {
  collective_competitions: ChampionshipBracketReviewCollectiveCompetitionSummary[];
  individual_sessions: ChampionshipBracketReviewIndividualSessionSummary[];
}

export type ChampionshipBracketStructuralReviewTimelineEntryType =
  | "BREAK"
  | "RESOURCE_LOCK"
  | "INDIVIDUAL_SESSION"
  | "MANUAL_FINAL_BLOCK"
  | "FREE_WINDOW";

export type ChampionshipBracketStructuralReviewPlanningItemType =
  "SPORT_TARGET";

export type ChampionshipBracketStructuralReviewPlanningStatus =
  | "WITHIN_CAPACITY"
  | "OVERFLOW";

export interface ChampionshipBracketStructuralReviewDiagnostic {
  code: string;
  severity: ChampionshipBracketPreviewDiagnosticSeverity;
  message: string;
  date: string | null;
  location_name: string | null;
  court_name: string | null;
  sport_id: string | null;
  sport_name: string | null;
  team_id: string | null;
  team_name: string | null;
}

export interface ChampionshipBracketStructuralReviewTimelineEntry {
  type: ChampionshipBracketStructuralReviewTimelineEntryType;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  sport_id: string | null;
  sport_name: string | null;
  naipe: MatchNaipe | null;
  division: TeamDivision | null;
  lock_mode: ChampionshipBracketResourceLockInput["lock_mode"] | null;
  division_scope: ChampionshipBracketKnockoutProgramBlockInput["division_scope"] | null;
}

export interface ChampionshipBracketStructuralReviewEstimatedMatchEntry {
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  phase: ChampionshipBracketPreviewPhase | null;
  phase_label: string;
  match_number: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  estimated: true;
}

export interface ChampionshipBracketStructuralReviewPendingMatchEntry {
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  phase: ChampionshipBracketPreviewPhase | null;
  phase_label: string;
  match_number: number;
  estimated: true;
}

export interface ChampionshipBracketStructuralReviewPlanningItem {
  type: ChampionshipBracketStructuralReviewPlanningItemType;
  sport_id: string;
  sport_name: string;
  planned_match_count: number;
  match_duration_minutes: number;
  planned_minutes: number;
  free_minutes: number;
  remaining_minutes: number;
  additional_match_capacity: number;
  overflow_minutes: number;
  status: ChampionshipBracketStructuralReviewPlanningStatus;
  has_playable_window: boolean;
}

export interface ChampionshipBracketStructuralReviewCourt {
  court_key: string;
  court_name: string;
  blocked_minutes: number;
  free_minutes: number;
  planned_collective_minutes: number;
  overflow_minutes: number;
  timeline_entries: ChampionshipBracketStructuralReviewTimelineEntry[];
  estimated_match_entries: ChampionshipBracketStructuralReviewEstimatedMatchEntry[];
  pending_match_entries: ChampionshipBracketStructuralReviewPendingMatchEntry[];
  unallocated_match_count: number;
  planning_items: ChampionshipBracketStructuralReviewPlanningItem[];
}

export interface ChampionshipBracketStructuralReviewLocation {
  location_key: string;
  location_name: string;
  courts: ChampionshipBracketStructuralReviewCourt[];
}

export interface ChampionshipBracketStructuralReviewDay {
  date: string;
  start_time: string;
  end_time: string;
  locations: ChampionshipBracketStructuralReviewLocation[];
}

export interface ChampionshipBracketStructuralReviewSummary {
  planned_target_count: number;
  planned_match_count: number;
  collective_planned_minutes: number;
  blocked_minutes: number;
  free_minutes: number;
  remaining_minutes: number;
  overflow_minutes: number;
  estimated_match_count: number;
  unallocated_match_count: number;
  diagnostics_count: number;
}

export interface ChampionshipBracketStructuralReviewResult {
  summary: ChampionshipBracketStructuralReviewSummary;
  days: ChampionshipBracketStructuralReviewDay[];
  diagnostics: ChampionshipBracketStructuralReviewDiagnostic[];
}

export interface ChampionshipBracketTieBreakPendingTeam {
  team_id: string;
  team_name: string;
}

export interface ChampionshipBracketTieBreakPendingContext {
  context_key: string;
  competition_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  context_type: ChampionshipBracketTieBreakContextType;
  group_id: string | null;
  group_number: number | null;
  qualification_rank: number | null;
  title: string;
  description: string;
  teams: ChampionshipBracketTieBreakPendingTeam[];
}

export interface ChampionshipBracketTieBreakResolutionSaveInput {
  context_key: string;
  competition_id: string;
  context_type: ChampionshipBracketTieBreakContextType;
  group_id?: string | null;
  qualification_rank?: number | null;
  team_ids: string[];
}

export interface ChampionshipBracketResolvedTieBreakOrderContext {
  context_key: string;
  competition_id: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  context_type: ChampionshipBracketTieBreakContextType;
  group_id: string | null;
  group_number: number | null;
  qualification_rank: number | null;
  team_ids: string[];
}

export interface ChampionshipCorrectedGroupStanding {
  competition_id: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  group_id: string;
  group_number: number;
  group_size: number;
  team_id: string;
  team_name: string;
  wins: number;
  points_base: number;
  correction_factor: number;
  corrected_points: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  yellow_cards: number;
  red_cards: number;
  blue_cards: number;
  two_minute_penalties: number;
  points_average: number;
}

export interface ChampionshipBracketCompetitionConfigDraft {
  groups_count: number;
  qualifiers_per_group: number;
  should_complete_knockout_with_best_second_placed_teams: boolean;
  knockout_pairing_mode: ChampionshipKnockoutPairingMode;
}

export type ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft = Record<
  string,
  string[]
>;

export interface ChampionshipBracketScheduleCourtDraft {
  id: string;
  name: string;
  position: number;
  sport_ids: string[];
  sport_preference?: ChampionshipBracketCourtSportPreferenceInput | null;
  sport_match_targets?: ChampionshipBracketCourtSportMatchTargetInput[];
}

export interface ChampionshipBracketScheduleLocationDraft {
  id: string;
  location_template_id: string | null;
  name: string;
  position: number;
  courts: ChampionshipBracketScheduleCourtDraft[];
}

export interface ChampionshipBracketScheduleDayDraft {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_start_time: string;
  break_end_time: string;
  locations: ChampionshipBracketScheduleLocationDraft[];
}

export interface ChampionshipBracketWizardDraftFormValues {
  step_flow_version?: number;
  current_step_index: number;
  highest_unlocked_step_index?: number;
  season_settings: ChampionshipSeasonSettingsInput;
  selected_team_ids: string[];
  enabled_sport_ids: string[];
  selected_sport_ids_by_team_id: Record<string, string[]>;
  show_estimated_start_time_on_cards_by_sport_id: Record<string, boolean>;
  selected_competition_keys_by_team_id: Record<string, string[]>;
  should_apply_modalities_to_all_teams: boolean;
  should_apply_naipes_to_all_teams: boolean;
  should_replicate_previous_schedule_day: boolean;
  competition_config_by_key: Record<
    string,
    ChampionshipBracketCompetitionConfigDraft
  >;
  group_assignments_by_competition_key: Record<string, Record<string, number>>;
  group_order_by_competition_key: Record<
    string,
    ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft
  >;
  schedule_days: ChampionshipBracketScheduleDayDraft[];
  competition_date_availability?: ChampionshipBracketCompetitionDateAvailabilityInput[];
  team_competition_date_availability?: ChampionshipBracketTeamCompetitionDateAvailabilityInput[];
  individual_event_configs: ChampionshipBracketIndividualEventConfigInput[];
  individual_session_configs: ChampionshipBracketIndividualSessionConfigInput[];
  resource_locks: ChampionshipBracketResourceLockInput[];
  match_numbering_mode: ChampionshipBracketMatchNumberingMode;
  knockout_program_blocks: ChampionshipBracketKnockoutProgramBlockInput[];
  exact_preview_cache?: ChampionshipBracketExactPreviewCache | null;
}

export interface ChampionshipBracketRemoteDraftMetadata {
  edition_id: string;
  season_year: number;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
}

export interface ChampionshipBracketWizardDraftFetchResult {
  draft_form_values: ChampionshipBracketWizardDraftFormValues | null;
  metadata: ChampionshipBracketRemoteDraftMetadata | null;
  source: "remote" | "local" | "none";
}

export interface MatchSetInput {
  set_number: number;
  home_points: number;
  away_points: number;
}

export interface BracketDayBreak {
  id: string;
  bracket_day_id: string;
  break_start_time: string;
  break_end_time: string;
  position: number;
  scope_type: BracketDayBreakScopeType;
  bracket_court_id: string | null;
}

export type BracketDayBreakScopeType = "ALL_COURTS" | "COURT";

export interface BracketDayCourtOption {
  id: string;
  court_group_id: string;
  name: string;
  location_name: string;
  label: string;
}

export interface BracketDaySchedule {
  id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  breaks: BracketDayBreak[];
  courts: BracketDayCourtOption[];
}

export interface BracketDayScheduleUpdate {
  date: string;
  start_time: string;
  end_time: string;
  breaks: Array<{
    break_start_time: string;
    break_end_time: string;
    position: number;
    scope_type: BracketDayBreakScopeType;
    bracket_court_id: string | null;
  }>;
}

export interface EditableMatchScheduleSlot {
  slot_number: number;
  start_time: string;
  start_time_label: string;
  is_current_slot: boolean;
}

export interface EditableMatchScheduleSlotQueryInput {
  match_id: string;
  target_date: string;
  target_location: string;
  target_court_name: string;
  sport_id?: string | null;
  naipe?: MatchNaipe | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
}

export interface ScheduledMatchLogisticsUpdateInput {
  match_id: string;
  scheduled_date: string;
  location: string;
  court_name: string;
  slot_start_time: string;
  representation_mode: MatchManualRepresentationMode;
  sport_id?: string | null;
  naipe?: MatchNaipe | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
}

export interface BracketCourtPriorityUpdate {
  bracket_court_id: string;
  sport_id: string;
  preferred_naipe: MatchNaipe | null;
  preferred_division: TeamDivision | null;
}

export interface BracketCourtSportEntry {
  sport_id: string;
  preferred_naipe: MatchNaipe | null;
  preferred_division: TeamDivision | null;
  sequence_mode: ChampionshipBracketCourtSequenceMode;
  alternate_naipe_after_exclusive_knockout_phase: boolean;
}

export interface BracketCourtWithSports {
  id: string;
  name: string;
  position: number;
  court_group_id?: string;
  sports: BracketCourtSportEntry[];
}

export interface BracketLocationWithCourts {
  id: string;
  name: string;
  position: number;
  location_group_id?: string;
  courts: BracketCourtWithSports[];
}

export interface BracketDayCourtSports {
  bracket_day_id: string;
  event_date: string;
  locations: BracketLocationWithCourts[];
}

export type BracketLocationSportPriorityMode = "NONE" | "NAIPE" | "DIVISION";

export type BracketKnockoutPriorityPhase = "SEMIFINAL" | "FINAL";

export type BracketKnockoutPriorityDivisionScope = TeamDivision | "ALL";

export interface BracketLocationSportPriorityCourtGroup {
  court_group_id: string;
  court_name: string;
  position: number;
  sequence_modes: ChampionshipBracketCourtSequenceMode[];
  is_sequence_locked: boolean;
}

export interface BracketLocationSportPriorityGroup {
  location_group_id: string;
  location_name: string;
  sport_id: string;
  priority_mode: BracketLocationSportPriorityMode;
  courts: BracketLocationSportPriorityCourtGroup[];
}

export interface BracketLocationSportPriorityUpdate {
  location_group_id: string;
  sport_id: string;
  priority_mode: BracketLocationSportPriorityMode;
}

export interface BracketKnockoutPriorityCourtOption {
  location_group_id: string;
  location_name: string;
  location_position: number;
  court_group_id: string;
  court_name: string;
  court_position: number;
}

export interface BracketKnockoutCourtPriorityGroup {
  sport_id: string;
  phase: BracketKnockoutPriorityPhase;
  division_scope: BracketKnockoutPriorityDivisionScope;
  location_group_id: string | null;
  court_group_id: string | null;
  courts: BracketKnockoutPriorityCourtOption[];
}

export interface BracketKnockoutCourtPriorityUpdate {
  sport_id: string;
  phase: BracketKnockoutPriorityPhase;
  division_scope: BracketKnockoutPriorityDivisionScope;
  location_group_id: string | null;
  court_group_id: string | null;
}

export interface BracketGeneratedCourtGroup {
  court_group_id: string;
  court_name: string;
  position: number;
}

export interface BracketGeneratedLocationGroup {
  location_group_id: string;
  location_name: string;
  position: number;
  courts: BracketGeneratedCourtGroup[];
}

export interface BracketGeneratedLocationGroupUpdate {
  location_group_id: string;
  location_name: string;
  courts: Array<{
    court_group_id: string;
    court_name: string;
  }>;
}
