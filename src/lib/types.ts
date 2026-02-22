export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';

export interface Team {
  id: string;
  name: string;
  city: string;
  created_at: string;
}

export interface Sport {
  id: string;
  name: string;
  created_at: string;
}

export interface Match {
  id: string;
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
  sports?: Sport;
  home_team?: Team;
  away_team?: Team;
}

export interface Standing {
  id: string;
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
  teams?: Team;
  sports?: Sport;
}
