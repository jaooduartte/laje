import type {
  BracketThirdPlaceMode,
  ChampionshipBracketTieBreakContextType,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";

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
  third_place_mode: BracketThirdPlaceMode;
  groups: ChampionshipBracketGroupInput[];
}

export interface ChampionshipBracketCourtInput {
  name: string;
  position: number;
  sport_ids: string[];
}

export interface ChampionshipBracketLocationInput {
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

export interface ChampionshipBracketSetupFormValues {
  participants: ChampionshipBracketParticipantInput[];
  competitions: ChampionshipBracketCompetitionInput[];
  schedule_days: ChampionshipBracketScheduleDayInput[];
}

export interface ChampionshipBracketPreviewResult {
  ok: boolean;
  message?: string | null;
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

export interface ChampionshipBracketCompetitionConfigDraft {
  groups_count: number;
  qualifiers_per_group: number;
  should_complete_knockout_with_best_second_placed_teams: boolean;
}

export type ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft = Record<string, string[]>;

export interface ChampionshipBracketScheduleCourtDraft {
  id: string;
  name: string;
  position: number;
  sport_ids: string[];
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
  current_step_index: number;
  selected_team_ids: string[];
  selected_sport_ids_by_team_id: Record<string, string[]>;
  show_estimated_start_time_on_cards_by_sport_id: Record<string, boolean>;
  selected_competition_keys_by_team_id: Record<string, string[]>;
  should_apply_modalities_to_all_teams: boolean;
  should_apply_naipes_to_all_teams: boolean;
  should_replicate_previous_schedule_day: boolean;
  competition_config_by_key: Record<string, ChampionshipBracketCompetitionConfigDraft>;
  group_assignments_by_competition_key: Record<string, Record<string, number>>;
  group_order_by_competition_key: Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft>;
  schedule_days: ChampionshipBracketScheduleDayDraft[];
}

export interface MatchSetInput {
  set_number: number;
  home_points: number;
  away_points: number;
}
