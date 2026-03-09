import type {
  ChampionshipBracketCompetitionConfigDraft,
  ChampionshipBracketScheduleCourtDraft,
  ChampionshipBracketScheduleDayDraft,
  ChampionshipBracketScheduleLocationDraft,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import { resolveRandomUuid } from "@/lib/random";

function resolveStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item == "string");
}

function resolveNumberValue(value: unknown, fallback_value: number): number {
  if (typeof value != "number" || Number.isNaN(value)) {
    return fallback_value;
  }

  return value;
}

function resolveBooleanValue(value: unknown, fallback_value: boolean): boolean {
  if (typeof value != "boolean") {
    return fallback_value;
  }

  return value;
}

function resolveCompetitionConfigByKey(
  competition_config_by_key: unknown,
): Record<string, ChampionshipBracketCompetitionConfigDraft> {
  if (!competition_config_by_key || typeof competition_config_by_key != "object" || Array.isArray(competition_config_by_key)) {
    return {};
  }

  return Object.entries(competition_config_by_key).reduce<Record<string, ChampionshipBracketCompetitionConfigDraft>>(
    (carry, [competition_key, competition_config]) => {
      if (!competition_config || typeof competition_config != "object" || Array.isArray(competition_config)) {
        return carry;
      }

      carry[competition_key] = {
        groups_count: Math.max(1, resolveNumberValue((competition_config as ChampionshipBracketCompetitionConfigDraft).groups_count, 1)),
        qualifiers_per_group: Math.max(
          1,
          resolveNumberValue((competition_config as ChampionshipBracketCompetitionConfigDraft).qualifiers_per_group, 1),
        ),
      };

      return carry;
    },
    {},
  );
}

function resolveGroupAssignmentsByCompetitionKey(group_assignments_by_competition_key: unknown): Record<string, Record<string, number>> {
  if (
    !group_assignments_by_competition_key ||
    typeof group_assignments_by_competition_key != "object" ||
    Array.isArray(group_assignments_by_competition_key)
  ) {
    return {};
  }

  return Object.entries(group_assignments_by_competition_key).reduce<Record<string, Record<string, number>>>(
    (carry, [competition_key, team_group_map]) => {
      if (!team_group_map || typeof team_group_map != "object" || Array.isArray(team_group_map)) {
        return carry;
      }

      carry[competition_key] = Object.entries(team_group_map).reduce<Record<string, number>>((group_carry, [team_id, group_number]) => {
        if (typeof group_number != "number" || Number.isNaN(group_number)) {
          return group_carry;
        }

        group_carry[team_id] = Math.max(1, group_number);
        return group_carry;
      }, {});

      return carry;
    },
    {},
  );
}

function resolveScheduleCourtDraft(schedule_court: unknown): ChampionshipBracketScheduleCourtDraft | null {
  if (!schedule_court || typeof schedule_court != "object" || Array.isArray(schedule_court)) {
    return null;
  }

  const parsed_schedule_court = schedule_court as ChampionshipBracketScheduleCourtDraft;

  return {
    id: typeof parsed_schedule_court.id == "string" && parsed_schedule_court.id ? parsed_schedule_court.id : resolveRandomUuid(),
    name: typeof parsed_schedule_court.name == "string" ? parsed_schedule_court.name : "",
    position: Math.max(1, resolveNumberValue(parsed_schedule_court.position, 1)),
    sport_ids: resolveStringArray(parsed_schedule_court.sport_ids),
  };
}

function resolveScheduleLocationDraft(schedule_location: unknown): ChampionshipBracketScheduleLocationDraft | null {
  if (!schedule_location || typeof schedule_location != "object" || Array.isArray(schedule_location)) {
    return null;
  }

  const parsed_schedule_location = schedule_location as ChampionshipBracketScheduleLocationDraft;
  const courts = Array.isArray(parsed_schedule_location.courts)
    ? parsed_schedule_location.courts
        .map((schedule_court) => resolveScheduleCourtDraft(schedule_court))
        .filter((schedule_court): schedule_court is ChampionshipBracketScheduleCourtDraft => schedule_court != null)
    : [];

  return {
    id: typeof parsed_schedule_location.id == "string" && parsed_schedule_location.id ? parsed_schedule_location.id : resolveRandomUuid(),
    name: typeof parsed_schedule_location.name == "string" ? parsed_schedule_location.name : "",
    position: Math.max(1, resolveNumberValue(parsed_schedule_location.position, 1)),
    courts,
  };
}

function resolveScheduleDayDraft(schedule_day: unknown): ChampionshipBracketScheduleDayDraft | null {
  if (!schedule_day || typeof schedule_day != "object" || Array.isArray(schedule_day)) {
    return null;
  }

  const parsed_schedule_day = schedule_day as ChampionshipBracketScheduleDayDraft;
  const locations = Array.isArray(parsed_schedule_day.locations)
    ? parsed_schedule_day.locations
        .map((schedule_location) => resolveScheduleLocationDraft(schedule_location))
        .filter((schedule_location): schedule_location is ChampionshipBracketScheduleLocationDraft => schedule_location != null)
    : [];

  return {
    id: typeof parsed_schedule_day.id == "string" && parsed_schedule_day.id ? parsed_schedule_day.id : resolveRandomUuid(),
    date: typeof parsed_schedule_day.date == "string" ? parsed_schedule_day.date : "",
    start_time: typeof parsed_schedule_day.start_time == "string" ? parsed_schedule_day.start_time : "08:00",
    end_time: typeof parsed_schedule_day.end_time == "string" ? parsed_schedule_day.end_time : "18:00",
    break_start_time: typeof parsed_schedule_day.break_start_time == "string" ? parsed_schedule_day.break_start_time : "",
    break_end_time: typeof parsed_schedule_day.break_end_time == "string" ? parsed_schedule_day.break_end_time : "",
    locations,
  };
}

function resolveScheduleDays(schedule_days: unknown): ChampionshipBracketScheduleDayDraft[] {
  if (!Array.isArray(schedule_days)) {
    return [];
  }

  return schedule_days
    .map((schedule_day) => resolveScheduleDayDraft(schedule_day))
    .filter((schedule_day): schedule_day is ChampionshipBracketScheduleDayDraft => schedule_day != null);
}

export class ChampionshipBracketWizardDraftDTO {
  private readonly form_values: ChampionshipBracketWizardDraftFormValues;

  constructor(form_values: ChampionshipBracketWizardDraftFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(form_values: ChampionshipBracketWizardDraftFormValues): ChampionshipBracketWizardDraftDTO {
    return new ChampionshipBracketWizardDraftDTO(form_values);
  }

  static fromStorageValue(storage_value: string | null): ChampionshipBracketWizardDraftDTO | null {
    if (!storage_value) {
      return null;
    }

    try {
      const parsed_storage_value = JSON.parse(storage_value) as Partial<ChampionshipBracketWizardDraftFormValues>;

      return new ChampionshipBracketWizardDraftDTO({
        current_step_index: Math.max(0, resolveNumberValue(parsed_storage_value.current_step_index, 0)),
        selected_team_ids: resolveStringArray(parsed_storage_value.selected_team_ids),
        selected_sport_ids_by_team_id: Object.entries(parsed_storage_value.selected_sport_ids_by_team_id ?? {}).reduce<
          Record<string, string[]>
        >((carry, [team_id, selected_sport_ids]) => {
          carry[team_id] = resolveStringArray(selected_sport_ids);
          return carry;
        }, {}),
        selected_competition_keys_by_team_id: Object.entries(parsed_storage_value.selected_competition_keys_by_team_id ?? {}).reduce<
          Record<string, string[]>
        >((carry, [team_id, selected_competition_keys]) => {
          carry[team_id] = resolveStringArray(selected_competition_keys);
          return carry;
        }, {}),
        should_apply_modalities_to_all_teams: resolveBooleanValue(parsed_storage_value.should_apply_modalities_to_all_teams, true),
        should_apply_naipes_to_all_teams: resolveBooleanValue(parsed_storage_value.should_apply_naipes_to_all_teams, true),
        should_apply_group_selection_to_all_competitions: resolveBooleanValue(
          parsed_storage_value.should_apply_group_selection_to_all_competitions,
          false,
        ),
        should_replicate_previous_schedule_day: resolveBooleanValue(parsed_storage_value.should_replicate_previous_schedule_day, false),
        competition_config_by_key: resolveCompetitionConfigByKey(parsed_storage_value.competition_config_by_key),
        group_assignments_by_competition_key: resolveGroupAssignmentsByCompetitionKey(
          parsed_storage_value.group_assignments_by_competition_key,
        ),
        schedule_days: resolveScheduleDays(parsed_storage_value.schedule_days),
      });
    } catch {
      return null;
    }
  }

  bindToSave(): ChampionshipBracketWizardDraftFormValues {
    return {
      current_step_index: Math.max(0, this.form_values.current_step_index),
      selected_team_ids: [...new Set(this.form_values.selected_team_ids)],
      selected_sport_ids_by_team_id: Object.entries(this.form_values.selected_sport_ids_by_team_id).reduce<Record<string, string[]>>(
        (carry, [team_id, selected_sport_ids]) => {
          carry[team_id] = [...new Set(selected_sport_ids)];
          return carry;
        },
        {},
      ),
      selected_competition_keys_by_team_id: Object.entries(this.form_values.selected_competition_keys_by_team_id).reduce<
        Record<string, string[]>
      >((carry, [team_id, selected_competition_keys]) => {
        carry[team_id] = [...new Set(selected_competition_keys)];
        return carry;
      }, {}),
      should_apply_modalities_to_all_teams: this.form_values.should_apply_modalities_to_all_teams,
      should_apply_naipes_to_all_teams: this.form_values.should_apply_naipes_to_all_teams,
      should_apply_group_selection_to_all_competitions: this.form_values.should_apply_group_selection_to_all_competitions,
      should_replicate_previous_schedule_day: this.form_values.should_replicate_previous_schedule_day,
      competition_config_by_key: Object.entries(this.form_values.competition_config_by_key).reduce<
        Record<string, ChampionshipBracketCompetitionConfigDraft>
      >((carry, [competition_key, competition_config]) => {
        carry[competition_key] = {
          groups_count: Math.max(1, competition_config.groups_count),
          qualifiers_per_group: Math.max(1, competition_config.qualifiers_per_group),
        };
        return carry;
      }, {}),
      group_assignments_by_competition_key: Object.entries(this.form_values.group_assignments_by_competition_key).reduce<
        Record<string, Record<string, number>>
      >((carry, [competition_key, team_group_map]) => {
        carry[competition_key] = Object.entries(team_group_map).reduce<Record<string, number>>((group_carry, [team_id, group_number]) => {
          group_carry[team_id] = Math.max(1, group_number);
          return group_carry;
        }, {});
        return carry;
      }, {}),
      schedule_days: this.form_values.schedule_days.map((schedule_day) => ({
        id: schedule_day.id,
        date: schedule_day.date,
        start_time: schedule_day.start_time,
        end_time: schedule_day.end_time,
        break_start_time: schedule_day.break_start_time,
        break_end_time: schedule_day.break_end_time,
        locations: schedule_day.locations.map((schedule_location) => ({
          id: schedule_location.id,
          name: schedule_location.name,
          position: schedule_location.position,
          courts: schedule_location.courts.map((schedule_court) => ({
            id: schedule_court.id,
            name: schedule_court.name,
            position: schedule_court.position,
            sport_ids: [...new Set(schedule_court.sport_ids)],
          })),
        })),
      })),
    };
  }
}
