export type KnockoutResultCorrectionWalkoverMode = "HOME_LOST" | "AWAY_LOST";

export interface KnockoutResultCorrectionSource {
  match_id: string;
  bracket_match_id: string;
  round_number: number;
  slot_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  previous_winner_team_id: string | null;
  previous_winner_team_name: string | null;
  corrected_winner_team_id: string;
  corrected_winner_team_name: string;
  walkover_mode: KnockoutResultCorrectionWalkoverMode;
}

export interface KnockoutResultCorrectionReplayMatch {
  bracket_match_id: string;
  round_number: number;
  slot_number: number;
  current_match_id: string | null;
  current_status: string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  duration_minutes: number;
}

export interface KnockoutResultCorrectionImpact {
  bracket_match_id: string;
  match_id: string | null;
  depth: number;
  round_number: number;
  slot_number: number;
  status: string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  action: "REPLAY" | "DEMATERIALIZE" | "RESET_SLOT";
}

export interface KnockoutResultCorrectionFinalSlot {
  bracket_match_id: string;
  round_number: number;
  slot_number: number;
  planned_scheduled_date: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  planned_location_name: string | null;
  planned_court_name: string | null;
  pending_side: "HOME" | "AWAY" | null;
  preserved_team_id: string | null;
  preserved_team_name: string | null;
}

export interface KnockoutResultCorrectionScheduleCandidate {
  id: string;
  scheduled_date: string;
  bracket_court_id: string;
  location_group_id: string | null;
  court_group_id: string | null;
  location_name: string;
  court_name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  planned_scheduled_slot: number;
  planned_queue_position: number;
}

export interface KnockoutResultCorrectionPreview {
  requires_reprocessing: boolean;
  is_knockout_match: boolean;
  blocked: boolean;
  block_reason: string | null;
  requires_replay_schedule: boolean;
  schedule_preview_generated: boolean;
  remaining_event_days: number;
  source?: KnockoutResultCorrectionSource;
  replay_match?: KnockoutResultCorrectionReplayMatch;
  final_slot?: KnockoutResultCorrectionFinalSlot | null;
  impacts: KnockoutResultCorrectionImpact[];
  schedule_candidates: KnockoutResultCorrectionScheduleCandidate[];
}

export interface ApplyKnockoutResultCorrectionResult {
  correction_id: string;
  source_match_id: string;
  corrected_winner_team_id: string;
  replay_bracket_match_id: string;
  replay_match_id: string | null;
  final_slot: KnockoutResultCorrectionFinalSlot | null;
}
