import type { BracketThirdPlaceMode, MatchNaipe, TeamDivision } from "@/lib/enums";

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

export interface ChampionshipBracketCompetitionConfigDraft {
  groups_count: number;
  qualifiers_per_group: number;
}

export interface ChampionshipBracketScheduleCourtDraft {
  id: string;
  name: string;
  position: number;
  sport_ids: string[];
}

export interface ChampionshipBracketScheduleLocationDraft {
  id: string;
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
  selected_competition_keys_by_team_id: Record<string, string[]>;
  should_apply_modalities_to_all_teams: boolean;
  should_apply_naipes_to_all_teams: boolean;
  should_apply_group_selection_to_all_competitions: boolean;
  should_replicate_previous_schedule_day: boolean;
  competition_config_by_key: Record<string, ChampionshipBracketCompetitionConfigDraft>;
  group_assignments_by_competition_key: Record<string, Record<string, number>>;
  schedule_days: ChampionshipBracketScheduleDayDraft[];
}

export interface MatchSetInput {
  set_number: number;
  home_points: number;
  away_points: number;
}
