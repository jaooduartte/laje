import type {
  ChampionshipCode,
  ChampionshipSportNaipeMode,
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
  division: TeamDivision;
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
  sport_id: string;
  home_team_id: string;
  away_team_id: string;
  location: string;
  start_time: string;
  end_time: string;
  status: MatchStatus;
  home_score: number;
  away_score: number;
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
  updated_at: string;
  // Joined
  championships?: Championship;
  teams?: Team;
  sports?: Sport;
}
