import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";
import type {
  AdminActionType,
  AdminPanelPermissionLevel,
  AdminPanelRole,
  AdminPanelTab,
  AdminUserPasswordStatus,
  LeagueEventOrganizerType,
  LeagueEventType,
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  BracketEditionStatus,
  BracketPhase,
  BracketThirdPlaceMode,
  MatchNaipe,
  MatchStatus,
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
  created_at: string;
}

export interface Sport {
  id: string;
  name: string;
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
  points_win: number;
  points_draw: number;
  points_loss: number;
  created_at: string;
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
  scheduled_date: string | null;
  queue_position: number | null;
  current_set_home_score?: number | null;
  current_set_away_score?: number | null;
  resolved_tie_breaker_rule?: ChampionshipSportTieBreakerRule | null;
  resolved_tie_break_winner_team_id?: string | null;
  start_time: string | null;
  end_time: string | null;
  status: MatchStatus;
  home_score: number;
  home_yellow_cards: number;
  home_red_cards: number;
  away_score: number;
  away_yellow_cards: number;
  away_red_cards: number;
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
  updated_at: string;
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
  location: string;
  event_date: string;
  created_at: string;
  updated_at: string;
  organizer_team?: Team | null;
  organizer_teams?: Team[];
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

export type AdminTabPermissionByTab = Record<AdminPanelTab, AdminPanelPermissionLevel>;

export interface CurrentUserAdminContext {
  role: AdminPanelRole | null;
  profile_id: string | null;
  profile_name: string | null;
  matches_permission: AdminPanelPermissionLevel;
  control_permission: AdminPanelPermissionLevel;
  teams_permission: AdminPanelPermissionLevel;
  sports_permission: AdminPanelPermissionLevel;
  events_permission: AdminPanelPermissionLevel;
  logs_permission: AdminPanelPermissionLevel;
  users_permission: AdminPanelPermissionLevel;
  account_permission: AdminPanelPermissionLevel;
  settings_permission: AdminPanelPermissionLevel;
}

export interface PublicAccessSettings {
  is_public_access_blocked: boolean;
  is_live_page_blocked: boolean;
  is_championships_page_blocked: boolean;
  is_schedule_page_blocked: boolean;
  is_league_calendar_page_blocked: boolean;
  blocked_message: string | null;
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
  third_place_mode: BracketThirdPlaceMode;
  groups: ChampionshipBracketGroup[];
  knockout_matches: ChampionshipBracketKnockoutMatch[];
}

export interface ChampionshipBracketView {
  edition: ChampionshipBracketEdition | null;
  competitions: ChampionshipBracketCompetition[];
}
