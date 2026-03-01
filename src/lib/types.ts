import type {
  AdminActionType,
  AdminPanelPermissionLevel,
  AdminPanelRole,
  AdminPanelTab,
  LeagueEventOrganizerType,
  LeagueEventType,
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";

export interface Championship {
  id: string;
  code: ChampionshipCode;
  name: string;
  status: ChampionshipStatus;
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
  supports_cards: boolean;
  tie_breaker_rule: ChampionshipSportTieBreakerRule;
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
  division: TeamDivision | null;
  naipe: MatchNaipe;
  supports_cards: boolean;
  sport_id: string;
  home_team_id: string;
  away_team_id: string;
  location: string;
  start_time: string;
  end_time: string;
  status: MatchStatus;
  home_score: number;
  home_yellow_cards: number;
  home_red_cards: number;
  away_score: number;
  away_yellow_cards: number;
  away_red_cards: number;
  created_at: string;
  // Joined
  championships?: Championship;
  sports?: Sport;
  home_team?: Team;
  away_team?: Team;
}

export interface Standing {
  id: string;
  championship_id: string;
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
  email: string | null;
  role: AdminPanelRole | null;
  profile_id: string | null;
  profile_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}
