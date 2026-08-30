import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
import type {
  AdminActionType,
  AdminPanelPermissionLevel,
  AdminPanelRole,
  AdminPanelTab,
  AdminUserPasswordStatus,
  LeagueCalendarHolidayDayKind,
  LeagueCalendarHolidayScope,
  LeagueEventOrganizerType,
  LeagueEventReservationRequestStatus,
  LeagueEventType,
  ChampionshipCode,
  ChampionshipSchedulePeriod,
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventKind,
  ChampionshipIndividualEventStatus,
  ChampionshipIndividualSessionStatus,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  ThemeMode,
  BracketEditionStatus,
  BracketPhase,
  BracketThirdPlaceMode,
  PublicLinkFilterMode,
  MatchNaipe,
  MatchStatus,
  MatchManualRepresentationMode,
  TeamDivision,
} from "@/lib/enums";

export interface Championship {
  id: string;
  code: ChampionshipCode;
  name: string;
  status: ChampionshipStatus;
  current_season_year: number;
  uses_divisions: boolean;
  default_location: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  city: string;
  division: TeamDivision | null;
  is_active?: boolean;
  created_at: string;
}

export interface ChampionshipSeasonSettings {
  id: string;
  championship_id: string;
  season_year: number;
  division_format: ChampionshipSeasonDivisionFormat;
  division_settlement_mode: ChampionshipSeasonDivisionSettlementMode;
  principal_slots_count: number | null;
  principal_relegation_count: number | null;
  access_promotion_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChampionshipSeasonDivisionMovement {
  id: string;
  championship_id: string;
  season_year: number;
  team_id: string;
  previous_division: TeamDivision | null;
  next_division: TeamDivision | null;
  source_division: TeamDivision | null;
  ranking_position: number;
  rule_code: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  team?: Team | null;
}

export interface ChampionshipSchedulePeriodOption {
  date: string;
  period: ChampionshipSchedulePeriod;
  enabled: boolean;
}

export interface ChampionshipCompetitionPeriodAvailability {
  competition_key: string;
  date: string;
  period: ChampionshipSchedulePeriod;
  enabled: boolean;
}

export interface ChampionshipTeamCompetitionAvailability {
  team_id: string;
  competition_key: string;
  date: string;
  period: ChampionshipSchedulePeriod;
  enabled: boolean;
}

export interface ChampionshipIndividualPlacementPoint {
  placement: number;
  points: number | null;
}

export interface ChampionshipIndividualEventConfig {
  sport_id: string;
  placements_count: number;
  placement_points: ChampionshipIndividualPlacementPoint[];
  relay_multiplier: number;
}

export interface ChampionshipAthlete {
  id: string;
  championship_id: string;
  season_year: number;
  sport_id: string;
  team_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  name: string;
  normalized_name?: string | null;
  created_at: string;
  updated_at?: string;
  teams?: Team | null;
  sports?: Sport | null;
}

export interface ChampionshipIndividualEvent {
  id: string;
  session_id?: string | null;
  championship_id: string;
  season_year: number;
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  event_code: string;
  name: string;
  kind: ChampionshipIndividualEventKind;
  display_order: number;
  scheduled_date: string | null;
  period: ChampionshipSchedulePeriod | null;
  location: string | null;
  status: ChampionshipIndividualEventStatus;
  relay_multiplier: number;
  created_at: string;
  updated_at: string;
  sports?: Sport | null;
}

export interface ChampionshipIndividualSession {
  id: string;
  championship_id: string;
  season_year: number;
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  scheduled_date: string | null;
  period: ChampionshipSchedulePeriod | null;
  start_time: string | null;
  end_time: string | null;
  location_key: string | null;
  court_key: string | null;
  location_name: string | null;
  court_name: string | null;
  status: ChampionshipIndividualSessionStatus;
  exclusive_lock_enabled: boolean;
  created_at: string;
  updated_at: string;
  sports?: Sport | null;
}

export interface ChampionshipIndividualSessionScoreboardRow {
  session_id: string;
  team_id: string;
  total_points: number;
  confirmed_entries_count: number;
  first_places: number;
  second_places: number;
  third_places: number;
  relay_points_total: number;
  teams?: Team | null;
}

export interface ChampionshipIndividualEventEntry {
  id: string;
  event_id: string;
  team_id: string;
  athlete_id: string | null;
  athlete_name: string | null;
  entry_type: ChampionshipIndividualEventKind;
  final_position: number | null;
  result_time_milliseconds: number | null;
  result_mark_centimeters: number | null;
  lane_number?: number | null;
  attempt_one_centimeters?: number | null;
  attempt_two_centimeters?: number | null;
  attempt_three_centimeters?: number | null;
  status: ChampionshipIndividualEntryStatus;
  points_awarded: number;
  created_at: string;
  updated_at: string;
  teams?: Team | null;
  athlete?: ChampionshipAthlete | null;
  members?: ChampionshipIndividualEventEntryMember[];
}

export interface ChampionshipIndividualEventEntryMember {
  id: string;
  entry_id: string;
  athlete_id: string | null;
  athlete_name: string;
  is_starter: boolean;
  position: number;
  created_at: string;
  athlete?: ChampionshipAthlete | null;
}

export interface ChampionshipIndividualTeamStanding {
  id: string;
  championship_id: string;
  season_year: number;
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  team_id: string;
  total_points: number;
  scored_events_count: number;
  first_places: number;
  second_places: number;
  third_places: number;
  fourth_places: number;
  fifth_places: number;
  sixth_places: number;
  seventh_places: number;
  eighth_places: number;
  ninth_places: number;
  tenth_places: number;
  eleventh_places: number;
  twelfth_places: number;
  thirteenth_places: number;
  fourteenth_places: number;
  fifteenth_places: number;
  sixteenth_places: number;
  seventeenth_places: number;
  eighteenth_places: number;
  nineteenth_places: number;
  twentieth_places: number;
  relay_points_total: number;
  created_at: string;
  updated_at: string;
  teams?: Team | null;
  sports?: Sport | null;
}

export interface Sport {
  id: string;
  name: string;
  default_match_duration_minutes?: number | null;
  created_at: string;
}

export interface ChampionshipSport {
  id: string;
  championship_id: string;
  sport_id: string;
  naipe_mode: ChampionshipSportNaipeMode;
  result_rule: ChampionshipSportResultRule;
  supports_cards: boolean;
  tie_breaker_rule: ChampionshipSportTieBreakerRule;
  default_match_duration_minutes: number;
  show_estimated_start_time_on_cards: boolean;
  points_win: number;
  points_draw: number;
  points_loss: number;
  created_at: string;
  walkover_winner_points: number | null;
  walkover_winner_set_count: number;
  awards_include_knockout_phase: boolean;
  supports_individual_awards: boolean;
  // Joined
  championships?: Championship;
  sports?: Sport;
}

export interface Match {
  id: string;
  championship_id: string;
  season_year: number;
  division: TeamDivision | null;
  naipe: MatchNaipe;
  supports_cards: boolean;
  result_rule?: ChampionshipSportResultRule | null;
  sport_id: string;
  home_team_id: string;
  away_team_id: string;
  location: string;
  court_name: string | null;
  manual_representation_mode?: MatchManualRepresentationMode | null;
  scheduled_date: string | null;
  queue_position: number | null;
  scheduled_slot?: number | null;
  current_set_home_score?: number | null;
  current_set_away_score?: number | null;
  home_penalty_score?: number | null;
  away_penalty_score?: number | null;
  is_walkover?: boolean;
  is_double_walkover?: boolean;
  walkover_loser_team_id?: string | null;
  disqualification_id?: string | null;
  is_score_sheet_reviewed?: boolean;
  resolved_tie_breaker_rule?: ChampionshipSportTieBreakerRule | null;
  resolved_tie_break_winner_team_id?: string | null;
  start_time: string | null;
  end_time: string | null;
  status: MatchStatus;
  home_score: number;
  home_yellow_cards: number;
  home_red_cards: number;
  home_blue_cards?: number;
  home_two_minute_penalties?: number;
  away_score: number;
  away_yellow_cards: number;
  away_red_cards: number;
  away_blue_cards?: number;
  away_two_minute_penalties?: number;
  created_at: string;
  group_number?: number | null;
  // Joined
  championships?: Championship;
  sports?: Sport;
  home_team?: Team;
  away_team?: Team;
  match_sets?: MatchSetInput[];
}

export interface Standing {
  id: string;
  championship_id: string;
  season_year: number;
  division: TeamDivision | null;
  naipe: MatchNaipe;
  sport_id: string;
  team_id: string;
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
  blue_cards?: number;
  two_minute_penalties?: number;
  updated_at: string;
  is_individual_sport?: boolean;
  scored_events_count?: number;
  first_places?: number;
  second_places?: number;
  third_places?: number;
  fourth_places?: number;
  fifth_places?: number;
  sixth_places?: number;
  seventh_places?: number;
  eighth_places?: number;
  ninth_places?: number;
  tenth_places?: number;
  eleventh_places?: number;
  twelfth_places?: number;
  thirteenth_places?: number;
  fourteenth_places?: number;
  fifteenth_places?: number;
  sixteenth_places?: number;
  seventeenth_places?: number;
  eighteenth_places?: number;
  nineteenth_places?: number;
  twentieth_places?: number;
  relay_points_total?: number;
  // Joined
  championships?: Championship;
  teams?: Team;
  sports?: Sport;
}

export interface LeagueEvent {
  id: string;
  name: string;
  event_type: LeagueEventType;
  organizer_type: LeagueEventOrganizerType;
  organizer_team_id: string | null;
  event_date: string;
  created_at: string;
  updated_at: string;
  organizer_team?: Team | null;
  organizer_teams?: Team[];
}

export interface LeagueEventReservationRequest {
  id: string;
  team_id: string;
  event_name: string;
  event_type: LeagueEventType;
  event_date: string;
  requester_name: string;
  requester_email: string;
  status: LeagueEventReservationRequestStatus;
  approved_league_event_id: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  team?: Team | null;
  approved_league_event?: LeagueEvent | null;
}

export interface LeagueCalendarHoliday {
  id: string;
  holiday_date: string;
  name: string;
  scope: LeagueCalendarHolidayScope;
  day_kind: LeagueCalendarHolidayDayKind;
  created_at: string;
  updated_at: string;
}

export interface AdminActionLog {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: AdminPanelRole | null;
  action_type: AdminActionType;
  resource_table: string;
  record_id: string | null;
  description: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type AdminTabPermissionByTab = Record<
  AdminPanelTab,
  AdminPanelPermissionLevel
>;

export interface CurrentUserAdminContext {
  role: AdminPanelRole | null;
  profile_id: string | null;
  profile_name: string | null;
  matches_permission: AdminPanelPermissionLevel;
  control_permission: AdminPanelPermissionLevel;
  teams_permission: AdminPanelPermissionLevel;
  sports_permission: AdminPanelPermissionLevel;
  events_permission: AdminPanelPermissionLevel;
  links_permission?: AdminPanelPermissionLevel;
  logs_permission: AdminPanelPermissionLevel;
  users_permission: AdminPanelPermissionLevel;
  account_permission: AdminPanelPermissionLevel;
  championship_status_permission: AdminPanelPermissionLevel;
  settings_permission: AdminPanelPermissionLevel;
  score_sheet_review_permission: AdminPanelPermissionLevel;
  tie_breaks_permission: AdminPanelPermissionLevel;
  standings_permission?: AdminPanelPermissionLevel;
  championship_schedule_permission?: AdminPanelPermissionLevel;
  individual_events_permission?: AdminPanelPermissionLevel;
  opening_ceremony_bonus_permission?: AdminPanelPermissionLevel;
}

export interface PublicAccessSettings {
  is_public_access_blocked: boolean;
  is_live_page_blocked: boolean;
  is_championships_page_blocked: boolean;
  is_schedule_page_blocked: boolean;
  is_league_calendar_page_blocked: boolean;
  is_links_page_blocked: boolean;
  blocked_message: string | null;
  announcement_message: string | null;
  updated_at: string | null;
}

export interface AdminProfile {
  profile_id: string;
  profile_name: string;
  is_system: boolean;
  permissions: AdminTabPermissionByTab;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  user_id: string;
  name: string;
  email: string | null;
  login_identifier: string;
  password_status: AdminUserPasswordStatus;
  role: AdminPanelRole | null;
  profile_id: string | null;
  profile_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface CurrentAdminAccount {
  user_id: string;
  name: string;
  email: string | null;
  login_identifier: string;
  password_status: AdminUserPasswordStatus;
  profile_id: string | null;
  profile_name: string | null;
  theme_mode_preference: ThemeMode;
}

export interface PublicLinkItemFilter {
  id: string;
  public_link_item_id: string;
  championship_id: string;
  season_year: number;
  created_at: string;
  championships?: Championship | null;
}

export interface PublicLinkItem {
  id: string;
  section_id: string;
  display_name: string;
  url: string;
  sort_order: number;
  is_active: boolean;
  filter_mode: PublicLinkFilterMode;
  created_at: string;
  updated_at: string;
  public_link_item_filters?: PublicLinkItemFilter[];
}

export interface PublicLinkSection {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  public_link_items?: PublicLinkItem[];
}

export interface HomeDashboardRankedMetricItem {
  team_id: string;
  team_name: string;
  value: number;
  secondary_value: number;
}

export interface HomeDashboardChampionshipDominanceItem {
  championship_code: string;
  team_id: string;
  team_name: string;
  titles_count: number;
}

export interface HomeDashboardSeasonInsightItem {
  id: string;
  label: string;
  team_name: string | null;
  value: number | null;
  unit: string | null;
  season_year?: number | null;
  championship_code?: ChampionshipCode | null;
  sport_name?: string | null;
}

export interface HomeDashboardNextEventDay {
  event_date: string;
  events: Array<{
    name: string;
    event_type: LeagueEventType;
    organizer_name: string;
  }>;
}

export interface HomeDashboardNextEventItem {
  event_date: string;
  name: string;
  event_type: LeagueEventType;
  organizer_name: string;
}

export interface HomeDashboardMetrics {
  season_year: number;
  top_performance: HomeDashboardRankedMetricItem[];
  most_matches: HomeDashboardRankedMetricItem[];
  most_appearances: HomeDashboardRankedMetricItem[];
  season_highlights: HomeDashboardRankedMetricItem[];
  championship_dominance: HomeDashboardChampionshipDominanceItem[];
  modality_participation: HomeDashboardRankedMetricItem[];
  season_insights: HomeDashboardSeasonInsightItem[];
  next_event_day: HomeDashboardNextEventDay | null;
  next_events: HomeDashboardNextEventItem[];
}

export interface ChampionshipBracketEdition {
  id: string;
  championship_id: string;
  season_year: number;
  status: BracketEditionStatus;
  payload_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChampionshipBracketSeasonView {
  season_year: number;
  championship_bracket_view: ChampionshipBracketView;
}

export interface ChampionshipBracketGroupTeam {
  team_id: string;
  team_name: string;
  team_city: string;
  position: number;
}

export interface ChampionshipBracketGroupMatch {
  id: string;
  match_id: string | null;
  status: MatchStatus | null;
  scheduled_date: string | null;
  queue_position: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  court_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  winner_team_id: string | null;
  winner_team_name: string | null;
}

export interface ChampionshipBracketGroup {
  id: string;
  group_number: number;
  teams: ChampionshipBracketGroupTeam[];
  matches: ChampionshipBracketGroupMatch[];
}

export interface ChampionshipBracketKnockoutMatch {
  id: string;
  round_number: number;
  slot_number: number;
  match_id: string | null;
  status: MatchStatus | null;
  scheduled_date: string | null;
  queue_position: number | null;
  scheduled_slot?: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  court_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  winner_team_id: string | null;
  winner_team_name: string | null;
  is_bye: boolean;
  is_third_place: boolean;
}

export interface ChampionshipBracketCompetition {
  id: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  groups_count: number;
  qualifiers_per_group: number;
  should_complete_knockout_with_best_second_placed_teams?: boolean | null;
  knockout_pairing_mode?: ChampionshipKnockoutPairingMode | null;
  third_place_mode: BracketThirdPlaceMode;
  groups: ChampionshipBracketGroup[];
  knockout_matches: ChampionshipBracketKnockoutMatch[];
}

export interface ChampionshipBracketView {
  edition: ChampionshipBracketEdition | null;
  competitions: ChampionshipBracketCompetition[];
}

export interface CompetitionTeamDisqualification {
  id: string;
  championship_id: string;
  season_year: number;
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  team_id: string;
  created_at: string;
  created_by: string | null;
}
