import type {
  ChampionshipBracketExactPreviewCache,
  ChampionshipBracketCompetitionPeriodAvailabilityInput,
  ChampionshipBracketCompetitionConfigDraft,
  ChampionshipBracketCompetitionDateAvailabilityInput,
  ChampionshipBracketCourtSportMatchTargetPlanningMode,
  ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft,
  ChampionshipBracketIndividualSessionConfigInput,
  ChampionshipBracketIndividualEventConfigInput,
  ChampionshipBracketKnockoutProgramBlockInput,
  ChampionshipBracketResourceLockInput,
  ChampionshipBracketCourtSportPreferenceInput,
  ChampionshipBracketCourtSportMatchTargetInput,
  ChampionshipBracketCourtSequenceMode,
  ChampionshipBracketMatchNumberingMode,
  ChampionshipBracketScheduleCourtDraft,
  ChampionshipBracketScheduleDayDraft,
  ChampionshipBracketSchedulePeriodInput,
  ChampionshipBracketScheduleLocationDraft,
  ChampionshipBracketTeamCompetitionAvailabilityInput,
  ChampionshipBracketTeamCompetitionDateAvailabilityInput,
  ChampionshipSeasonSettingsInput,
  ChampionshipBracketWizardDraftFormValues,
  ChampionshipBracketAvailabilityWindowInput,
  ChampionshipBracketPreviewResult,
} from "@/domain/championship-brackets/championshipBracket.types";
import { resolveLegacyPeriodTimeRange } from "@/domain/championship-brackets/championshipBracketFixedTimeRange";
import { resolveCompetitionKnockoutPairingModeValue } from "@/domain/championship-brackets/championshipBracketPairing";
import { sanitizeIndividualEventConfigValue } from "@/domain/championship-brackets/championshipBracketWizardSync";
import {
  ChampionshipSchedulePeriod,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import { resolveRandomUuid } from "@/lib/random";

const CHAMPIONSHIP_BRACKET_WIZARD_STEP_FLOW_VERSION = 2;

type ChampionshipBracketStoredDraftValue = Partial<
  ChampionshipBracketWizardDraftFormValues
> & {
  schedule_periods?: unknown;
  competition_period_availability?: unknown;
  team_competition_availability?: unknown;
};

function resolveStepFlowVersion(value: unknown): number {
  if (typeof value != "number" || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, Math.trunc(value));
}

function resolveCurrentStepIndexByStepFlowVersion(
  currentStepIndex: number,
  stepFlowVersion: number,
): number {
  if (stepFlowVersion >= CHAMPIONSHIP_BRACKET_WIZARD_STEP_FLOW_VERSION) {
    return currentStepIndex;
  }

  const legacyStepIndexMap: Record<number, number> = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 11,
    7: 6,
    8: 7,
    9: 8,
    10: 9,
    11: 10,
    12: 12,
  };

  return legacyStepIndexMap[currentStepIndex] ?? currentStepIndex;
}

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

function resolveBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value != "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, boolean>>(
    (carry, [key, itemValue]) => {
      if (typeof itemValue != "boolean") {
        return carry;
      }

      carry[key] = itemValue;
      return carry;
    },
    {},
  );
}

function resolvePreviewResult(
  value: unknown,
): ChampionshipBracketPreviewResult | null {
  if (!value || typeof value != "object" || Array.isArray(value)) {
    return null;
  }

  const previewResult = value as Record<string, unknown>;

  return {
    ok: previewResult.ok === true,
    message:
      typeof previewResult.message == "string" ? previewResult.message : null,
    match_numbering_mode:
      previewResult.match_numbering_mode == "SPORT_NAIPE"
        ? "SPORT_NAIPE"
        : previewResult.match_numbering_mode == "SPORT"
          ? "SPORT"
          : "COURT",
    summary:
      previewResult.summary &&
      typeof previewResult.summary == "object" &&
      !Array.isArray(previewResult.summary)
        ? (previewResult.summary as ChampionshipBracketPreviewResult["summary"])
        : null,
    days: Array.isArray(previewResult.days)
      ? (previewResult.days as ChampionshipBracketPreviewResult["days"])
      : [],
    diagnostics: Array.isArray(previewResult.diagnostics)
      ? (previewResult.diagnostics as ChampionshipBracketPreviewResult["diagnostics"])
      : [],
  };
}

function resolveExactPreviewCache(
  value: unknown,
): ChampionshipBracketExactPreviewCache | null {
  if (!value || typeof value != "object" || Array.isArray(value)) {
    return null;
  }

  const parsedCache = value as Partial<ChampionshipBracketExactPreviewCache>;
  const previewResult = resolvePreviewResult(parsedCache.result);

  if (
    typeof parsedCache.payload_signature != "string" ||
    parsedCache.payload_signature.trim() == "" ||
    typeof parsedCache.generated_at != "string" ||
    parsedCache.generated_at.trim() == "" ||
    !previewResult
  ) {
    return null;
  }

  return {
    payload_signature: parsedCache.payload_signature,
    generated_at: parsedCache.generated_at,
    result: previewResult,
  };
}

function resolveCompetitionConfigByKey(
  competition_config_by_key: unknown,
): Record<string, ChampionshipBracketCompetitionConfigDraft> {
  if (
    !competition_config_by_key ||
    typeof competition_config_by_key != "object" ||
    Array.isArray(competition_config_by_key)
  ) {
    return {};
  }

  return Object.entries(competition_config_by_key).reduce<
    Record<string, ChampionshipBracketCompetitionConfigDraft>
  >((carry, [competition_key, competition_config]) => {
    if (
      !competition_config ||
      typeof competition_config != "object" ||
      Array.isArray(competition_config)
    ) {
      return carry;
    }

    carry[competition_key] = {
      groups_count: Math.max(
        1,
        resolveNumberValue(
          (competition_config as ChampionshipBracketCompetitionConfigDraft)
            .groups_count,
          1,
        ),
      ),
      qualifiers_per_group: Math.max(
        1,
        resolveNumberValue(
          (competition_config as ChampionshipBracketCompetitionConfigDraft)
            .qualifiers_per_group,
          1,
        ),
      ),
      should_complete_knockout_with_best_second_placed_teams:
        resolveBooleanValue(
          (competition_config as ChampionshipBracketCompetitionConfigDraft)
            .should_complete_knockout_with_best_second_placed_teams,
          true,
        ),
      knockout_pairing_mode: resolveCompetitionKnockoutPairingModeValue(
        (competition_config as ChampionshipBracketCompetitionConfigDraft)
          .knockout_pairing_mode,
      ),
    };

    return carry;
  }, {});
}

function resolveGroupAssignmentsByCompetitionKey(
  group_assignments_by_competition_key: unknown,
): Record<string, Record<string, number>> {
  if (
    !group_assignments_by_competition_key ||
    typeof group_assignments_by_competition_key != "object" ||
    Array.isArray(group_assignments_by_competition_key)
  ) {
    return {};
  }

  return Object.entries(group_assignments_by_competition_key).reduce<
    Record<string, Record<string, number>>
  >((carry, [competition_key, team_group_map]) => {
    if (
      !team_group_map ||
      typeof team_group_map != "object" ||
      Array.isArray(team_group_map)
    ) {
      return carry;
    }

    carry[competition_key] = Object.entries(team_group_map).reduce<
      Record<string, number>
    >((group_carry, [team_id, group_number]) => {
      if (typeof group_number != "number" || Number.isNaN(group_number)) {
        return group_carry;
      }

      group_carry[team_id] = Math.max(1, group_number);
      return group_carry;
    }, {});

    return carry;
  }, {});
}

function resolveGroupOrderByCompetitionKey(
  group_order_by_competition_key: unknown,
): Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft> {
  if (
    !group_order_by_competition_key ||
    typeof group_order_by_competition_key != "object" ||
    Array.isArray(group_order_by_competition_key)
  ) {
    return {};
  }

  return Object.entries(group_order_by_competition_key).reduce<
    Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft>
  >((carry, [competition_key, group_team_ids_by_group_number]) => {
    if (
      !group_team_ids_by_group_number ||
      typeof group_team_ids_by_group_number != "object" ||
      Array.isArray(group_team_ids_by_group_number)
    ) {
      return carry;
    }

    carry[competition_key] = Object.entries(
      group_team_ids_by_group_number,
    ).reduce<ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft>(
      (groupCarry, [group_number, team_ids]) => {
        const resolvedTeamIds = [...new Set(resolveStringArray(team_ids))];

        if (resolvedTeamIds.length == 0) {
          return groupCarry;
        }

        groupCarry[group_number] = resolvedTeamIds;
        return groupCarry;
      },
      {},
    );

    return carry;
  }, {});
}

function resolveMatchNaipeValue(value: unknown): MatchNaipe | null {
  switch (value) {
    case MatchNaipe.MASCULINO:
      return MatchNaipe.MASCULINO;

    case MatchNaipe.FEMININO:
      return MatchNaipe.FEMININO;

    case MatchNaipe.MISTO:
      return MatchNaipe.MISTO;

    default:
      return null;
  }
}

function resolveTeamDivisionValue(value: unknown): TeamDivision | null {
  switch (value) {
    case TeamDivision.DIVISAO_PRINCIPAL:
      return TeamDivision.DIVISAO_PRINCIPAL;

    case TeamDivision.DIVISAO_ACESSO:
      return TeamDivision.DIVISAO_ACESSO;

    default:
      return null;
  }
}

function resolveCourtSequenceModeValue(
  value: unknown,
): ChampionshipBracketCourtSequenceMode {
  switch (value) {
    case "GROUP_NAIPE":
      return "GROUP_NAIPE";

    case "GROUP_DIVISION":
      return "GROUP_DIVISION";

    case "FLEXIBLE":
    default:
      return "FLEXIBLE";
  }
}

function resolveMatchNumberingModeValue(
  value: unknown,
): ChampionshipBracketMatchNumberingMode {
  switch (value) {
    case "SPORT":
      return "SPORT";

    case "SPORT_NAIPE":
      return "SPORT_NAIPE";

    case "COURT":
    default:
      return "COURT";
  }
}

function resolveCourtSportPreferenceCandidate(
  value: unknown,
  sportIdField: "preferred_sport_id" | "sport_id",
  sportIds: string[],
  allowPreferenceWithoutRefinement: boolean,
): ChampionshipBracketCourtSportPreferenceInput | null {
  if (!value || typeof value != "object" || Array.isArray(value)) {
    return null;
  }

  const parsedPreference = value as Record<string, unknown>;

  const preferredSportId = parsedPreference[sportIdField];

  if (
    typeof preferredSportId != "string" ||
    !preferredSportId ||
    !sportIds.includes(preferredSportId)
  ) {
    return null;
  }

  const preferredNaipe = resolveMatchNaipeValue(
    parsedPreference["preferred_naipe"],
  );

  const preferredDivision = resolveTeamDivisionValue(
    parsedPreference["preferred_division"],
  );

  const sequenceMode = resolveCourtSequenceModeValue(
    parsedPreference["sequence_mode"],
  );

  const alternateNaipeAfterExclusiveKnockoutPhase =
    parsedPreference["alternate_naipe_after_exclusive_knockout_phase"] ===
    true;

  if (
    !allowPreferenceWithoutRefinement &&
    preferredNaipe == null &&
    preferredDivision == null
  ) {
    return null;
  }

  return {
    preferred_sport_id: preferredSportId,
    preferred_naipe: preferredNaipe,
    preferred_division: preferredDivision,
    sequence_mode: sequenceMode,
    alternate_naipe_after_exclusive_knockout_phase:
      alternateNaipeAfterExclusiveKnockoutPhase,
  };
}

function resolveScheduleCourtSportPreference(
  scheduleCourt: {
    sport_preference?: unknown;
    sport_priorities?: unknown;
  },
  sportIds: string[],
): ChampionshipBracketCourtSportPreferenceInput | null {
  const currentPreference = resolveCourtSportPreferenceCandidate(
    scheduleCourt.sport_preference,
    "preferred_sport_id",
    sportIds,
    true,
  );

  if (currentPreference) {
    return currentPreference;
  }

  if (!Array.isArray(scheduleCourt.sport_priorities)) {
    return null;
  }

  for (const legacyPriority of scheduleCourt.sport_priorities) {
    const resolvedLegacyPreference = resolveCourtSportPreferenceCandidate(
      legacyPriority,
      "sport_id",
      sportIds,
      false,
    );

    if (resolvedLegacyPreference) {
      return resolvedLegacyPreference;
    }
  }

  return null;
}

function resolveScheduleCourtSportMatchTargets(
  value: unknown,
  sportIds: string[],
): ChampionshipBracketCourtSportMatchTargetInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const targetBySportId = new Map<
    string,
    ChampionshipBracketCourtSportMatchTargetInput
  >();

  for (const target of value) {
    if (!target || typeof target != "object" || Array.isArray(target)) {
      continue;
    }

    const parsedTarget =
      target as Partial<ChampionshipBracketCourtSportMatchTargetInput>;

    if (
      typeof parsedTarget.sport_id != "string" ||
      !sportIds.includes(parsedTarget.sport_id) ||
      typeof parsedTarget.planned_match_count != "number" ||
      !Number.isInteger(parsedTarget.planned_match_count) ||
      parsedTarget.planned_match_count <= 0
    ) {
      continue;
    }

    targetBySportId.set(parsedTarget.sport_id, {
      sport_id: parsedTarget.sport_id,
      planned_match_count: parsedTarget.planned_match_count,
      planning_mode:
        parsedTarget.planning_mode == "AUTO"
          ? "AUTO"
          : ("MANUAL" satisfies ChampionshipBracketCourtSportMatchTargetPlanningMode),
    });
  }

  return [...targetBySportId.values()];
}

function resolveScheduleCourtDraft(
  schedule_court: unknown,
): ChampionshipBracketScheduleCourtDraft | null {
  if (
    !schedule_court ||
    typeof schedule_court != "object" ||
    Array.isArray(schedule_court)
  ) {
    return null;
  }

  const parsed_schedule_court =
    schedule_court as Partial<ChampionshipBracketScheduleCourtDraft> & {
      sport_preference?: unknown;
      sport_priorities?: unknown;
    };

  const sportIds = [
    ...new Set(resolveStringArray(parsed_schedule_court.sport_ids)),
  ];

  return {
    id:
      typeof parsed_schedule_court.id == "string" && parsed_schedule_court.id
        ? parsed_schedule_court.id
        : resolveRandomUuid(),

    name:
      typeof parsed_schedule_court.name == "string"
        ? parsed_schedule_court.name
        : "",

    position: Math.max(
      1,
      resolveNumberValue(parsed_schedule_court.position, 1),
    ),

    sport_ids: sportIds,

    sport_preference: resolveScheduleCourtSportPreference(
      parsed_schedule_court,
      sportIds,
    ),

    sport_match_targets: resolveScheduleCourtSportMatchTargets(
      parsed_schedule_court.sport_match_targets,
      sportIds,
    ),
  };
}

function resolveScheduleLocationDraft(
  schedule_location: unknown,
): ChampionshipBracketScheduleLocationDraft | null {
  if (
    !schedule_location ||
    typeof schedule_location != "object" ||
    Array.isArray(schedule_location)
  ) {
    return null;
  }

  const parsed_schedule_location =
    schedule_location as ChampionshipBracketScheduleLocationDraft;
  const courts = Array.isArray(parsed_schedule_location.courts)
    ? parsed_schedule_location.courts
        .map((schedule_court) => resolveScheduleCourtDraft(schedule_court))
        .filter(
          (
            schedule_court,
          ): schedule_court is ChampionshipBracketScheduleCourtDraft =>
            schedule_court != null,
        )
    : [];

  return {
    id:
      typeof parsed_schedule_location.id == "string" &&
      parsed_schedule_location.id
        ? parsed_schedule_location.id
        : resolveRandomUuid(),
    location_template_id:
      typeof parsed_schedule_location.location_template_id == "string" &&
      parsed_schedule_location.location_template_id
        ? parsed_schedule_location.location_template_id
        : null,
    name:
      typeof parsed_schedule_location.name == "string"
        ? parsed_schedule_location.name
        : "",
    position: Math.max(
      1,
      resolveNumberValue(parsed_schedule_location.position, 1),
    ),
    courts,
  };
}

function resolveScheduleDayDraft(
  schedule_day: unknown,
): ChampionshipBracketScheduleDayDraft | null {
  if (
    !schedule_day ||
    typeof schedule_day != "object" ||
    Array.isArray(schedule_day)
  ) {
    return null;
  }

  const parsed_schedule_day =
    schedule_day as ChampionshipBracketScheduleDayDraft;
  const locations = Array.isArray(parsed_schedule_day.locations)
    ? parsed_schedule_day.locations
        .map((schedule_location) =>
          resolveScheduleLocationDraft(schedule_location),
        )
        .filter(
          (
            schedule_location,
          ): schedule_location is ChampionshipBracketScheduleLocationDraft =>
            schedule_location != null,
        )
    : [];

  return {
    id:
      typeof parsed_schedule_day.id == "string" && parsed_schedule_day.id
        ? parsed_schedule_day.id
        : resolveRandomUuid(),
    date:
      typeof parsed_schedule_day.date == "string"
        ? parsed_schedule_day.date
        : "",
    start_time:
      typeof parsed_schedule_day.start_time == "string"
        ? parsed_schedule_day.start_time
        : "08:00",
    end_time:
      typeof parsed_schedule_day.end_time == "string"
        ? parsed_schedule_day.end_time
        : "18:00",
    break_start_time:
      typeof parsed_schedule_day.break_start_time == "string"
        ? parsed_schedule_day.break_start_time
        : "",
    break_end_time:
      typeof parsed_schedule_day.break_end_time == "string"
        ? parsed_schedule_day.break_end_time
        : "",
    locations,
  };
}

function resolveScheduleDays(
  schedule_days: unknown,
): ChampionshipBracketScheduleDayDraft[] {
  if (!Array.isArray(schedule_days)) {
    return [];
  }

  return schedule_days
    .map((schedule_day) => resolveScheduleDayDraft(schedule_day))
    .filter(
      (schedule_day): schedule_day is ChampionshipBracketScheduleDayDraft =>
        schedule_day != null,
    );
}

function resolveSeasonSettings(
  season_settings: unknown,
): ChampionshipSeasonSettingsInput {
  if (
    !season_settings ||
    typeof season_settings != "object" ||
    Array.isArray(season_settings)
  ) {
    return {
      division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
      division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
      principal_slots_count: null,
      principal_relegation_count: null,
      access_promotion_count: null,
    };
  }

  const parsedSeasonSettings =
    season_settings as Partial<ChampionshipSeasonSettingsInput>;

  return {
    division_format:
      parsedSeasonSettings.division_format ==
      ChampionshipSeasonDivisionFormat.SEPARATED
        ? ChampionshipSeasonDivisionFormat.SEPARATED
        : ChampionshipSeasonDivisionFormat.UNIFIED,
    division_settlement_mode:
      parsedSeasonSettings.division_settlement_mode ==
        ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION ||
      parsedSeasonSettings.division_settlement_mode ==
        ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL
        ? parsedSeasonSettings.division_settlement_mode
        : ChampionshipSeasonDivisionSettlementMode.NONE,
    principal_slots_count:
      typeof parsedSeasonSettings.principal_slots_count == "number"
        ? parsedSeasonSettings.principal_slots_count
        : null,
    principal_relegation_count:
      typeof parsedSeasonSettings.principal_relegation_count == "number"
        ? parsedSeasonSettings.principal_relegation_count
        : null,
    access_promotion_count:
      typeof parsedSeasonSettings.access_promotion_count == "number"
        ? parsedSeasonSettings.access_promotion_count
        : null,
  };
}

function resolveSchedulePeriods(
  schedule_periods: unknown,
): ChampionshipBracketSchedulePeriodInput[] {
  if (!Array.isArray(schedule_periods)) {
    return [];
  }

  return schedule_periods.reduce<ChampionshipBracketSchedulePeriodInput[]>(
    (carry, schedulePeriod) => {
      if (
        !schedulePeriod ||
        typeof schedulePeriod != "object" ||
        Array.isArray(schedulePeriod)
      ) {
        return carry;
      }

      const parsedSchedulePeriod =
        schedulePeriod as Partial<ChampionshipBracketSchedulePeriodInput>;

      if (
        typeof parsedSchedulePeriod.date != "string" ||
        (parsedSchedulePeriod.period != ChampionshipSchedulePeriod.MATUTINO &&
          parsedSchedulePeriod.period != ChampionshipSchedulePeriod.VESPERTINO)
      ) {
        return carry;
      }

      carry.push({
        date: parsedSchedulePeriod.date,
        period: parsedSchedulePeriod.period,
        enabled: parsedSchedulePeriod.enabled != false,
      });
      return carry;
    },
    [],
  );
}

function resolveCompetitionPeriodAvailability(
  value: unknown,
): ChampionshipBracketCompetitionPeriodAvailabilityInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChampionshipBracketCompetitionPeriodAvailabilityInput[]>(
    (carry, availabilityItem) => {
      if (
        !availabilityItem ||
        typeof availabilityItem != "object" ||
        Array.isArray(availabilityItem)
      ) {
        return carry;
      }

      const parsedAvailability =
        availabilityItem as Partial<ChampionshipBracketCompetitionPeriodAvailabilityInput>;

      if (
        typeof parsedAvailability.competition_key != "string" ||
        typeof parsedAvailability.date != "string" ||
        (parsedAvailability.period != ChampionshipSchedulePeriod.MATUTINO &&
          parsedAvailability.period != ChampionshipSchedulePeriod.VESPERTINO)
      ) {
        return carry;
      }

      carry.push({
        competition_key: parsedAvailability.competition_key,
        date: parsedAvailability.date,
        period: parsedAvailability.period,
        enabled: parsedAvailability.enabled != false,
      });
      return carry;
    },
    [],
  );
}

function resolveTeamCompetitionAvailability(
  value: unknown,
): ChampionshipBracketTeamCompetitionAvailabilityInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChampionshipBracketTeamCompetitionAvailabilityInput[]>(
    (carry, availabilityItem) => {
      if (
        !availabilityItem ||
        typeof availabilityItem != "object" ||
        Array.isArray(availabilityItem)
      ) {
        return carry;
      }

      const parsedAvailability =
        availabilityItem as Partial<ChampionshipBracketTeamCompetitionAvailabilityInput>;

      if (
        typeof parsedAvailability.team_id != "string" ||
        typeof parsedAvailability.competition_key != "string" ||
        typeof parsedAvailability.date != "string" ||
        (parsedAvailability.period != ChampionshipSchedulePeriod.MATUTINO &&
          parsedAvailability.period != ChampionshipSchedulePeriod.VESPERTINO)
      ) {
        return carry;
      }

      carry.push({
        team_id: parsedAvailability.team_id,
        competition_key: parsedAvailability.competition_key,
        date: parsedAvailability.date,
        period: parsedAvailability.period,
        enabled: parsedAvailability.enabled != false,
      });
      return carry;
    },
    [],
  );
}

function resolveTimeValueToMinutes(value: string): number | null {
  const [hourValue, minuteValue] = value.split(":").map(Number);

  if (
    Number.isNaN(hourValue) ||
    Number.isNaN(minuteValue) ||
    hourValue < 0 ||
    hourValue > 23 ||
    minuteValue < 0 ||
    minuteValue > 59
  ) {
    return null;
  }

  return hourValue * 60 + minuteValue;
}

function resolveMinutesToTimeValue(minutes: number): string {
  const hourValue = Math.floor(minutes / 60);
  const minuteValue = minutes % 60;

  return `${String(hourValue).padStart(2, "0")}:${String(minuteValue).padStart(
    2,
    "0",
  )}`;
}

function resolveLegacyFixedTimeRangeByDate({
  scheduleDays,
  date,
  period,
}: {
  scheduleDays: ChampionshipBracketScheduleDayDraft[];
  date: string;
  period: ChampionshipSchedulePeriod | null | undefined;
}) {
  if (
    period != ChampionshipSchedulePeriod.MATUTINO &&
    period != ChampionshipSchedulePeriod.VESPERTINO
  ) {
    return null;
  }

  const scheduleDay =
    scheduleDays.find((currentScheduleDay) => currentScheduleDay.date == date) ??
    null;

  if (!scheduleDay) {
    return null;
  }

  return resolveLegacyPeriodTimeRange({
    scheduleDay,
    period,
  });
}

function resolveAvailabilityWindows(
  value: unknown,
): ChampionshipBracketAvailabilityWindowInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChampionshipBracketAvailabilityWindowInput[]>(
    (carry, windowValue) => {
      if (
        !windowValue ||
        typeof windowValue != "object" ||
        Array.isArray(windowValue)
      ) {
        return carry;
      }

      const parsedWindow =
        windowValue as Partial<ChampionshipBracketAvailabilityWindowInput>;

      if (
        typeof parsedWindow.start_time != "string" ||
        typeof parsedWindow.end_time != "string"
      ) {
        return carry;
      }

      const startMinutes = resolveTimeValueToMinutes(parsedWindow.start_time);
      const endMinutes = resolveTimeValueToMinutes(parsedWindow.end_time);

      if (
        startMinutes == null ||
        endMinutes == null ||
        endMinutes <= startMinutes
      ) {
        return carry;
      }

      carry.push({
        start_time: parsedWindow.start_time,
        end_time: parsedWindow.end_time,
      });

      return carry;
    },
    [],
  );
}

function resolveCompetitionDateAvailability(
  value: unknown,
): ChampionshipBracketCompetitionDateAvailabilityInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const availabilityByKey = new Map<
    string,
    ChampionshipBracketCompetitionDateAvailabilityInput
  >();

  value.forEach((availabilityItem) => {
    if (
      !availabilityItem ||
      typeof availabilityItem != "object" ||
      Array.isArray(availabilityItem)
    ) {
      return;
    }

    const parsedAvailability =
      availabilityItem as Partial<ChampionshipBracketCompetitionDateAvailabilityInput>;

    if (
      typeof parsedAvailability.competition_key != "string" ||
      !parsedAvailability.competition_key ||
      typeof parsedAvailability.date != "string" ||
      !parsedAvailability.date ||
      (parsedAvailability.mode != "UNAVAILABLE" &&
        parsedAvailability.mode != "FULL_DAY" &&
        parsedAvailability.mode != "CUSTOM")
    ) {
      return;
    }

    const windows =
      parsedAvailability.mode == "CUSTOM"
        ? resolveAvailabilityWindows(parsedAvailability.windows)
        : [];

    availabilityByKey.set(
      `${parsedAvailability.competition_key}::${parsedAvailability.date}`,
      {
        competition_key: parsedAvailability.competition_key,
        date: parsedAvailability.date,
        mode:
          parsedAvailability.mode == "CUSTOM" && windows.length == 0
            ? "UNAVAILABLE"
            : parsedAvailability.mode,
        windows,
      },
    );
  });

  return [...availabilityByKey.values()];
}

function resolveTeamCompetitionDateAvailability(
  value: unknown,
): ChampionshipBracketTeamCompetitionDateAvailabilityInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const availabilityByKey = new Map<
    string,
    ChampionshipBracketTeamCompetitionDateAvailabilityInput
  >();

  value.forEach((availabilityItem) => {
    if (
      !availabilityItem ||
      typeof availabilityItem != "object" ||
      Array.isArray(availabilityItem)
    ) {
      return;
    }

    const parsedAvailability =
      availabilityItem as Partial<ChampionshipBracketTeamCompetitionDateAvailabilityInput>;

    if (
      typeof parsedAvailability.team_id != "string" ||
      !parsedAvailability.team_id ||
      typeof parsedAvailability.competition_key != "string" ||
      !parsedAvailability.competition_key ||
      typeof parsedAvailability.date != "string" ||
      !parsedAvailability.date ||
      (parsedAvailability.mode != "UNAVAILABLE" &&
        parsedAvailability.mode != "FULL_DAY" &&
        parsedAvailability.mode != "CUSTOM")
    ) {
      return;
    }

    const windows =
      parsedAvailability.mode == "CUSTOM"
        ? resolveAvailabilityWindows(parsedAvailability.windows)
        : [];

    availabilityByKey.set(
      `${parsedAvailability.team_id}::${parsedAvailability.competition_key}::${parsedAvailability.date}`,
      {
        team_id: parsedAvailability.team_id,
        competition_key: parsedAvailability.competition_key,
        date: parsedAvailability.date,
        mode:
          parsedAvailability.mode == "CUSTOM" && windows.length == 0
            ? "UNAVAILABLE"
            : parsedAvailability.mode,
        windows,
      },
    );
  });

  return [...availabilityByKey.values()];
}

function resolveLegacyDateAvailability(
  scheduleDay: ChampionshipBracketScheduleDayDraft,
  matutinoEnabled: boolean,
  vespertinoEnabled: boolean,
): {
  mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM";
  windows: ChampionshipBracketAvailabilityWindowInput[];
} {
  if (matutinoEnabled && vespertinoEnabled) {
    return { mode: "FULL_DAY", windows: [] };
  }

  if (!matutinoEnabled && !vespertinoEnabled) {
    return { mode: "UNAVAILABLE", windows: [] };
  }

  const startMinutes = resolveTimeValueToMinutes(scheduleDay.start_time);
  const endMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

  if (
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes
  ) {
    return { mode: "UNAVAILABLE", windows: [] };
  }

  const breakStartMinutes = scheduleDay.break_start_time
    ? resolveTimeValueToMinutes(scheduleDay.break_start_time)
    : null;
  const breakEndMinutes = scheduleDay.break_end_time
    ? resolveTimeValueToMinutes(scheduleDay.break_end_time)
    : null;

  const hasValidBreak =
    breakStartMinutes != null &&
    breakEndMinutes != null &&
    breakStartMinutes > startMinutes &&
    breakEndMinutes > breakStartMinutes &&
    breakEndMinutes < endMinutes;

  const matutinoStartMinutes = startMinutes;
  const matutinoEndMinutes = hasValidBreak
    ? breakStartMinutes
    : startMinutes + Math.floor((endMinutes - startMinutes) / 2);
  const vespertinoStartMinutes = hasValidBreak
    ? breakEndMinutes
    : matutinoEndMinutes;
  const vespertinoEndMinutes = endMinutes;

  if (matutinoEnabled) {
    if (matutinoEndMinutes <= matutinoStartMinutes) {
      return { mode: "UNAVAILABLE", windows: [] };
    }

    return {
      mode: "CUSTOM",
      windows: [
        {
          start_time: resolveMinutesToTimeValue(matutinoStartMinutes),
          end_time: resolveMinutesToTimeValue(matutinoEndMinutes),
        },
      ],
    };
  }

  if (vespertinoEndMinutes <= vespertinoStartMinutes) {
    return { mode: "UNAVAILABLE", windows: [] };
  }

  return {
    mode: "CUSTOM",
    windows: [
      {
        start_time: resolveMinutesToTimeValue(vespertinoStartMinutes),
        end_time: resolveMinutesToTimeValue(vespertinoEndMinutes),
      },
    ],
  };
}

function resolveLegacyCompetitionDateAvailability({
  scheduleDays,
  schedulePeriods,
  competitionPeriodAvailability,
  competitionKeys,
}: {
  scheduleDays: ChampionshipBracketScheduleDayDraft[];
  schedulePeriods: ChampionshipBracketSchedulePeriodInput[];
  competitionPeriodAvailability: ChampionshipBracketCompetitionPeriodAvailabilityInput[];
  competitionKeys: string[];
}): ChampionshipBracketCompetitionDateAvailabilityInput[] {
  const schedulePeriodEnabledByKey = new Map(
    schedulePeriods.map((schedulePeriod) => [
      `${schedulePeriod.date}::${schedulePeriod.period}`,
      schedulePeriod.enabled != false,
    ]),
  );

  const competitionAvailabilityByKey = new Map(
    competitionPeriodAvailability.map((availabilityItem) => [
      `${availabilityItem.competition_key}::${availabilityItem.date}::${availabilityItem.period}`,
      availabilityItem.enabled != false,
    ]),
  );

  return [...new Set(competitionKeys)].flatMap((competitionKey) =>
    scheduleDays
      .filter((scheduleDay) => scheduleDay.date)
      .map((scheduleDay) => {
        const matutinoEnabled =
          (schedulePeriodEnabledByKey.get(
            `${scheduleDay.date}::${ChampionshipSchedulePeriod.MATUTINO}`,
          ) ?? true) &&
          (competitionAvailabilityByKey.get(
            `${competitionKey}::${scheduleDay.date}::${ChampionshipSchedulePeriod.MATUTINO}`,
          ) ?? true);

        const vespertinoEnabled =
          (schedulePeriodEnabledByKey.get(
            `${scheduleDay.date}::${ChampionshipSchedulePeriod.VESPERTINO}`,
          ) ?? true) &&
          (competitionAvailabilityByKey.get(
            `${competitionKey}::${scheduleDay.date}::${ChampionshipSchedulePeriod.VESPERTINO}`,
          ) ?? true);

        const resolvedAvailability = resolveLegacyDateAvailability(
          scheduleDay,
          matutinoEnabled,
          vespertinoEnabled,
        );

        return {
          competition_key: competitionKey,
          date: scheduleDay.date,
          ...resolvedAvailability,
        };
      }),
  );
}

function resolveLegacyTeamCompetitionDateAvailability({
  scheduleDays,
  teamCompetitionAvailability,
  teamCompetitionKeysByTeamId,
}: {
  scheduleDays: ChampionshipBracketScheduleDayDraft[];
  teamCompetitionAvailability: ChampionshipBracketTeamCompetitionAvailabilityInput[];
  teamCompetitionKeysByTeamId: Record<string, string[]>;
}): ChampionshipBracketTeamCompetitionDateAvailabilityInput[] {
  const teamAvailabilityByKey = new Map(
    teamCompetitionAvailability.map((availabilityItem) => [
      `${availabilityItem.team_id}::${availabilityItem.competition_key}::${availabilityItem.date}::${availabilityItem.period}`,
      availabilityItem.enabled != false,
    ]),
  );

  return Object.entries(teamCompetitionKeysByTeamId).flatMap(
    ([teamId, competitionKeys]) =>
      [...new Set(competitionKeys)].flatMap((competitionKey) =>
        scheduleDays
          .filter((scheduleDay) => scheduleDay.date)
          .map((scheduleDay) => {
            const matutinoEnabled =
              teamAvailabilityByKey.get(
                `${teamId}::${competitionKey}::${scheduleDay.date}::${ChampionshipSchedulePeriod.MATUTINO}`,
              ) ?? true;

            const vespertinoEnabled =
              teamAvailabilityByKey.get(
                `${teamId}::${competitionKey}::${scheduleDay.date}::${ChampionshipSchedulePeriod.VESPERTINO}`,
              ) ?? true;

            const resolvedAvailability = resolveLegacyDateAvailability(
              scheduleDay,
              matutinoEnabled,
              vespertinoEnabled,
            );

            return {
              team_id: teamId,
              competition_key: competitionKey,
              date: scheduleDay.date,
              ...resolvedAvailability,
            };
          }),
      ),
  );
}

function resolveIndividualEventConfigs(
  value: unknown,
): ChampionshipBracketIndividualEventConfigInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChampionshipBracketIndividualEventConfigInput[]>(
    (carry, configItem) => {
      if (
        !configItem ||
        typeof configItem != "object" ||
        Array.isArray(configItem)
      ) {
        return carry;
      }

      const parsedConfig =
        configItem as Partial<ChampionshipBracketIndividualEventConfigInput>;

      if (typeof parsedConfig.sport_id != "string") {
        return carry;
      }

      carry.push(
        sanitizeIndividualEventConfigValue({
          ...parsedConfig,
          sport_id: parsedConfig.sport_id,
        }),
      );
      return carry;
    },
    [],
  );
}

function resolveIndividualSessionConfigs(
  value: unknown,
  scheduleDays: ChampionshipBracketScheduleDayDraft[],
): ChampionshipBracketIndividualSessionConfigInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChampionshipBracketIndividualSessionConfigInput[]>(
    (carry, sessionConfig) => {
      if (
        !sessionConfig ||
        typeof sessionConfig != "object" ||
        Array.isArray(sessionConfig)
      ) {
        return carry;
      }

      const parsedSessionConfig = sessionConfig as Partial<
        ChampionshipBracketIndividualSessionConfigInput
      > & {
        period?: ChampionshipSchedulePeriod | null;
      };

      if (
        typeof parsedSessionConfig.sport_id != "string" ||
        (parsedSessionConfig.naipe != "MASCULINO" &&
          parsedSessionConfig.naipe != "FEMININO" &&
          parsedSessionConfig.naipe != "MISTO")
      ) {
        return carry;
      }

      carry.push({
        sport_id: parsedSessionConfig.sport_id,
        naipe: parsedSessionConfig.naipe,
        division:
          parsedSessionConfig.division == "DIVISAO_PRINCIPAL" ||
          parsedSessionConfig.division == "DIVISAO_ACESSO"
            ? parsedSessionConfig.division
            : null,
        scheduled_date:
          typeof parsedSessionConfig.scheduled_date == "string"
            ? parsedSessionConfig.scheduled_date
            : null,
        start_time:
          typeof parsedSessionConfig.start_time == "string" &&
          typeof parsedSessionConfig.end_time == "string"
            ? parsedSessionConfig.start_time
            : typeof parsedSessionConfig.scheduled_date == "string"
              ? (resolveLegacyFixedTimeRangeByDate({
                  scheduleDays,
                  date: parsedSessionConfig.scheduled_date,
                  period: parsedSessionConfig.period,
                })?.start_time ?? null)
              : null,
        end_time:
          typeof parsedSessionConfig.start_time == "string" &&
          typeof parsedSessionConfig.end_time == "string"
            ? parsedSessionConfig.end_time
            : typeof parsedSessionConfig.scheduled_date == "string"
              ? (resolveLegacyFixedTimeRangeByDate({
                  scheduleDays,
                  date: parsedSessionConfig.scheduled_date,
                  period: parsedSessionConfig.period,
                })?.end_time ?? null)
              : null,
        location_key:
          typeof parsedSessionConfig.location_key == "string"
            ? parsedSessionConfig.location_key
            : null,
        court_key:
          typeof parsedSessionConfig.court_key == "string"
            ? parsedSessionConfig.court_key
            : null,
        location_name:
          typeof parsedSessionConfig.location_name == "string"
            ? parsedSessionConfig.location_name
            : null,
        court_name:
          typeof parsedSessionConfig.court_name == "string"
            ? parsedSessionConfig.court_name
            : null,
        exclusive_lock_enabled:
          parsedSessionConfig.exclusive_lock_enabled == true,
      });
      return carry;
    },
    [],
  );
}

function resolveKnockoutProgramBlocks(
  value: unknown,
  scheduleDays: ChampionshipBracketScheduleDayDraft[],
): ChampionshipBracketKnockoutProgramBlockInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const resolvedProgramBlocks = value.reduce<
    ChampionshipBracketKnockoutProgramBlockInput[]
  >((carry, knockoutProgramBlock) => {
    if (
      !knockoutProgramBlock ||
      typeof knockoutProgramBlock != "object" ||
      Array.isArray(knockoutProgramBlock)
    ) {
      return carry;
    }

    const parsedKnockoutProgramBlock = knockoutProgramBlock as Partial<
      ChampionshipBracketKnockoutProgramBlockInput
    > & {
      period?: ChampionshipSchedulePeriod | null;
    };

    if (
      typeof parsedKnockoutProgramBlock.date != "string" ||
      typeof parsedKnockoutProgramBlock.location_key != "string" ||
      typeof parsedKnockoutProgramBlock.court_key != "string" ||
      typeof parsedKnockoutProgramBlock.sport_id != "string"
    ) {
      return carry;
    }

    const explicitTimeRange =
      typeof parsedKnockoutProgramBlock.start_time == "string" &&
      typeof parsedKnockoutProgramBlock.end_time == "string"
        ? {
            start_time: parsedKnockoutProgramBlock.start_time,
            end_time: parsedKnockoutProgramBlock.end_time,
          }
        : resolveLegacyFixedTimeRangeByDate({
            scheduleDays,
            date: parsedKnockoutProgramBlock.date,
            period: parsedKnockoutProgramBlock.period,
          });

    if (!explicitTimeRange) {
      return carry;
    }

    const naipeSequence = Array.isArray(
      parsedKnockoutProgramBlock.naipe_sequence,
    )
      ? parsedKnockoutProgramBlock.naipe_sequence.filter(
          (naipe): naipe is MatchNaipe =>
            naipe == "MASCULINO" || naipe == "FEMININO" || naipe == "MISTO",
        )
      : [];

    carry.push({
      date: parsedKnockoutProgramBlock.date,
      start_time: explicitTimeRange.start_time,
      end_time: explicitTimeRange.end_time,
      location_key: parsedKnockoutProgramBlock.location_key,
      court_key: parsedKnockoutProgramBlock.court_key,
      location_name:
        typeof parsedKnockoutProgramBlock.location_name == "string"
          ? parsedKnockoutProgramBlock.location_name
          : null,
      court_name:
        typeof parsedKnockoutProgramBlock.court_name == "string"
          ? parsedKnockoutProgramBlock.court_name
          : null,
      sport_id: parsedKnockoutProgramBlock.sport_id,
      phase: "FINAL",
      division_scope:
        parsedKnockoutProgramBlock.division_scope == "DIVISAO_PRINCIPAL" ||
        parsedKnockoutProgramBlock.division_scope == "DIVISAO_ACESSO"
          ? parsedKnockoutProgramBlock.division_scope
          : "ALL",
      naipe_sequence: naipeSequence,
      match_duration_minutes_override:
        typeof parsedKnockoutProgramBlock.match_duration_minutes_override ==
          "number" &&
        Number.isInteger(
          parsedKnockoutProgramBlock.match_duration_minutes_override,
        ) &&
        parsedKnockoutProgramBlock.match_duration_minutes_override > 0
          ? parsedKnockoutProgramBlock.match_duration_minutes_override
          : null,
      display_order: Math.max(
        1,
        resolveNumberValue(parsedKnockoutProgramBlock.display_order, 1),
      ),
    });

    return carry;
  }, []);

  return resolvedProgramBlocks
    .sort(
      (leftProgramBlock, rightProgramBlock) =>
        leftProgramBlock.display_order - rightProgramBlock.display_order,
    )
    .map((programBlock, programBlockIndex) => ({
      ...programBlock,
      display_order: programBlockIndex + 1,
    }));
}

function resolveResourceLocks(
  value: unknown,
  scheduleDays: ChampionshipBracketScheduleDayDraft[],
): ChampionshipBracketResourceLockInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ChampionshipBracketResourceLockInput[]>(
    (carry, resourceLock) => {
      if (
        !resourceLock ||
        typeof resourceLock != "object" ||
        Array.isArray(resourceLock)
      ) {
        return carry;
      }

      const parsedResourceLock = resourceLock as Partial<
        ChampionshipBracketResourceLockInput
      > & {
        period?: ChampionshipSchedulePeriod | null;
      };

      if (
        typeof parsedResourceLock.date != "string" ||
        typeof parsedResourceLock.location_key != "string" ||
        typeof parsedResourceLock.court_key != "string"
      ) {
        return carry;
      }

      const explicitTimeRange =
        typeof parsedResourceLock.start_time == "string" &&
        typeof parsedResourceLock.end_time == "string"
          ? {
              start_time: parsedResourceLock.start_time,
              end_time: parsedResourceLock.end_time,
            }
          : resolveLegacyFixedTimeRangeByDate({
              scheduleDays,
              date: parsedResourceLock.date,
              period: parsedResourceLock.period,
            });

      if (!explicitTimeRange) {
        return carry;
      }

      carry.push({
        date: parsedResourceLock.date,
        start_time: explicitTimeRange.start_time,
        end_time: explicitTimeRange.end_time,
        location_key: parsedResourceLock.location_key,
        court_key: parsedResourceLock.court_key,
        location_name:
          typeof parsedResourceLock.location_name == "string"
            ? parsedResourceLock.location_name
            : null,
        court_name:
          typeof parsedResourceLock.court_name == "string"
            ? parsedResourceLock.court_name
            : null,
        lock_mode: parsedResourceLock.lock_mode == "HARD" ? "HARD" : "FLEXIBLE",
        competition_key:
          typeof parsedResourceLock.competition_key == "string"
            ? parsedResourceLock.competition_key
            : null,
        sport_id:
          typeof parsedResourceLock.sport_id == "string"
            ? parsedResourceLock.sport_id
            : null,
        naipe:
          parsedResourceLock.naipe == "MASCULINO" ||
          parsedResourceLock.naipe == "FEMININO" ||
          parsedResourceLock.naipe == "MISTO"
            ? parsedResourceLock.naipe
            : null,
        division:
          parsedResourceLock.division == "DIVISAO_PRINCIPAL" ||
          parsedResourceLock.division == "DIVISAO_ACESSO"
            ? parsedResourceLock.division
            : null,
      });
      return carry;
    },
    [],
  );
}

export class ChampionshipBracketWizardDraftDTO {
  private readonly form_values: ChampionshipBracketWizardDraftFormValues;

  constructor(form_values: ChampionshipBracketWizardDraftFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(
    form_values: ChampionshipBracketWizardDraftFormValues,
  ): ChampionshipBracketWizardDraftDTO {
    return new ChampionshipBracketWizardDraftDTO(form_values);
  }

  static fromStorageValue(
    storage_value: string | null,
  ): ChampionshipBracketWizardDraftDTO | null {
    if (!storage_value) {
      return null;
    }

    try {
      const parsed_storage_value = JSON.parse(
        storage_value,
      ) as ChampionshipBracketStoredDraftValue;
      const stepFlowVersion = resolveStepFlowVersion(
        parsed_storage_value.step_flow_version,
      );
      const currentStepIndex = resolveCurrentStepIndexByStepFlowVersion(
        Math.max(
          0,
          resolveNumberValue(parsed_storage_value.current_step_index, 0),
        ),
        stepFlowVersion,
      );
      const highestUnlockedStepIndex = Math.max(
        currentStepIndex,
        resolveCurrentStepIndexByStepFlowVersion(
          Math.max(
            0,
            resolveNumberValue(
              parsed_storage_value.highest_unlocked_step_index,
              currentStepIndex,
            ),
          ),
          stepFlowVersion,
        ),
      );

      const scheduleDays = resolveScheduleDays(
        parsed_storage_value.schedule_days,
      );
      const schedulePeriods = resolveSchedulePeriods(
        parsed_storage_value.schedule_periods,
      );
      const competitionPeriodAvailability =
        resolveCompetitionPeriodAvailability(
          parsed_storage_value.competition_period_availability,
        );
      const teamCompetitionAvailability = resolveTeamCompetitionAvailability(
        parsed_storage_value.team_competition_availability,
      );
      const selectedCompetitionKeysByTeamId = Object.entries(
        parsed_storage_value.selected_competition_keys_by_team_id ?? {},
      ).reduce<Record<string, string[]>>(
        (carry, [team_id, selected_competition_keys]) => {
          carry[team_id] = resolveStringArray(selected_competition_keys);
          return carry;
        },
        {},
      );

      const legacyCompetitionKeys =
        competitionPeriodAvailability.length > 0
          ? competitionPeriodAvailability.map(
              (availabilityItem) => availabilityItem.competition_key,
            )
          : Object.values(selectedCompetitionKeysByTeamId).flat();

      const legacyTeamCompetitionKeysByTeamId =
        teamCompetitionAvailability.length > 0
          ? teamCompetitionAvailability.reduce<Record<string, string[]>>(
              (carry, availabilityItem) => {
                if (!carry[availabilityItem.team_id]) {
                  carry[availabilityItem.team_id] = [];
                }

                carry[availabilityItem.team_id].push(
                  availabilityItem.competition_key,
                );

                return carry;
              },
              {},
            )
          : selectedCompetitionKeysByTeamId;

      const competitionDateAvailability = Array.isArray(
        parsed_storage_value.competition_date_availability,
      )
        ? resolveCompetitionDateAvailability(
            parsed_storage_value.competition_date_availability,
          )
        : resolveLegacyCompetitionDateAvailability({
            scheduleDays,
            schedulePeriods,
            competitionPeriodAvailability,
            competitionKeys: legacyCompetitionKeys,
          });

      const teamCompetitionDateAvailability = Array.isArray(
        parsed_storage_value.team_competition_date_availability,
      )
        ? resolveTeamCompetitionDateAvailability(
            parsed_storage_value.team_competition_date_availability,
          )
        : resolveLegacyTeamCompetitionDateAvailability({
            scheduleDays,
            teamCompetitionAvailability,
            teamCompetitionKeysByTeamId: legacyTeamCompetitionKeysByTeamId,
          });

      return new ChampionshipBracketWizardDraftDTO({
        step_flow_version: CHAMPIONSHIP_BRACKET_WIZARD_STEP_FLOW_VERSION,
        current_step_index: currentStepIndex,
        highest_unlocked_step_index: highestUnlockedStepIndex,
        season_settings: resolveSeasonSettings(
          parsed_storage_value.season_settings,
        ),
        enabled_sport_ids: resolveStringArray(
          parsed_storage_value.enabled_sport_ids,
        ),
        selected_team_ids: resolveStringArray(
          parsed_storage_value.selected_team_ids,
        ),
        selected_sport_ids_by_team_id: Object.entries(
          parsed_storage_value.selected_sport_ids_by_team_id ?? {},
        ).reduce<Record<string, string[]>>(
          (carry, [team_id, selected_sport_ids]) => {
            carry[team_id] = resolveStringArray(selected_sport_ids);
            return carry;
          },
          {},
        ),
        show_estimated_start_time_on_cards_by_sport_id: resolveBooleanRecord(
          parsed_storage_value.show_estimated_start_time_on_cards_by_sport_id,
        ),
        selected_competition_keys_by_team_id:
          selectedCompetitionKeysByTeamId,
        should_apply_modalities_to_all_teams: resolveBooleanValue(
          parsed_storage_value.should_apply_modalities_to_all_teams,
          true,
        ),
        should_apply_naipes_to_all_teams: resolveBooleanValue(
          parsed_storage_value.should_apply_naipes_to_all_teams,
          true,
        ),
        should_replicate_previous_schedule_day: resolveBooleanValue(
          parsed_storage_value.should_replicate_previous_schedule_day,
          false,
        ),
        competition_config_by_key: resolveCompetitionConfigByKey(
          parsed_storage_value.competition_config_by_key,
        ),
        group_assignments_by_competition_key:
          resolveGroupAssignmentsByCompetitionKey(
            parsed_storage_value.group_assignments_by_competition_key,
          ),
        group_order_by_competition_key: resolveGroupOrderByCompetitionKey(
          parsed_storage_value.group_order_by_competition_key,
        ),
        schedule_days: scheduleDays,
        competition_date_availability: competitionDateAvailability,
        team_competition_date_availability: teamCompetitionDateAvailability,
        individual_event_configs: resolveIndividualEventConfigs(
          parsed_storage_value.individual_event_configs,
        ),
        individual_session_configs: resolveIndividualSessionConfigs(
          parsed_storage_value.individual_session_configs,
          scheduleDays,
        ),
        resource_locks: resolveResourceLocks(
          parsed_storage_value.resource_locks,
          scheduleDays,
        ),
        match_numbering_mode: resolveMatchNumberingModeValue(
          parsed_storage_value.match_numbering_mode,
        ),
        knockout_program_blocks: resolveKnockoutProgramBlocks(
          parsed_storage_value.knockout_program_blocks,
          scheduleDays,
        ),
        exact_preview_cache: resolveExactPreviewCache(
          parsed_storage_value.exact_preview_cache,
        ),
      });
    } catch {
      return null;
    }
  }

  bindToSave(): ChampionshipBracketWizardDraftFormValues {
    return {
      step_flow_version: CHAMPIONSHIP_BRACKET_WIZARD_STEP_FLOW_VERSION,
      current_step_index: Math.max(0, this.form_values.current_step_index),
      highest_unlocked_step_index: Math.max(
        Math.max(0, this.form_values.current_step_index),
        Math.max(
          0,
          this.form_values.highest_unlocked_step_index ??
            this.form_values.current_step_index,
        ),
      ),
      season_settings: {
        division_format: this.form_values.season_settings.division_format,
        division_settlement_mode:
          this.form_values.season_settings.division_settlement_mode,
        principal_slots_count:
          this.form_values.season_settings.principal_slots_count,
        principal_relegation_count:
          this.form_values.season_settings.principal_relegation_count,
        access_promotion_count:
          this.form_values.season_settings.access_promotion_count,
      },
      selected_team_ids: [...new Set(this.form_values.selected_team_ids)],
      enabled_sport_ids: [...new Set(this.form_values.enabled_sport_ids)],
      selected_sport_ids_by_team_id: Object.entries(
        this.form_values.selected_sport_ids_by_team_id,
      ).reduce<Record<string, string[]>>(
        (carry, [team_id, selected_sport_ids]) => {
          carry[team_id] = [...new Set(selected_sport_ids)];
          return carry;
        },
        {},
      ),
      show_estimated_start_time_on_cards_by_sport_id: Object.entries(
        this.form_values.show_estimated_start_time_on_cards_by_sport_id,
      ).reduce<Record<string, boolean>>(
        (carry, [sport_id, shouldShowEstimatedStartTimeOnCards]) => {
          carry[sport_id] = shouldShowEstimatedStartTimeOnCards;
          return carry;
        },
        {},
      ),
      selected_competition_keys_by_team_id: Object.entries(
        this.form_values.selected_competition_keys_by_team_id,
      ).reduce<Record<string, string[]>>(
        (carry, [team_id, selected_competition_keys]) => {
          carry[team_id] = [...new Set(selected_competition_keys)];
          return carry;
        },
        {},
      ),
      should_apply_modalities_to_all_teams:
        this.form_values.should_apply_modalities_to_all_teams,
      should_apply_naipes_to_all_teams:
        this.form_values.should_apply_naipes_to_all_teams,
      should_replicate_previous_schedule_day:
        this.form_values.should_replicate_previous_schedule_day,
      competition_config_by_key: Object.entries(
        this.form_values.competition_config_by_key,
      ).reduce<Record<string, ChampionshipBracketCompetitionConfigDraft>>(
        (carry, [competition_key, competition_config]) => {
          carry[competition_key] = {
            groups_count: Math.max(1, competition_config.groups_count),
            qualifiers_per_group: Math.max(
              1,
              competition_config.qualifiers_per_group,
            ),
            should_complete_knockout_with_best_second_placed_teams:
              competition_config.should_complete_knockout_with_best_second_placed_teams,
            knockout_pairing_mode: resolveCompetitionKnockoutPairingModeValue(
              competition_config.knockout_pairing_mode,
            ),
          };
          return carry;
        },
        {},
      ),
      group_assignments_by_competition_key: Object.entries(
        this.form_values.group_assignments_by_competition_key,
      ).reduce<Record<string, Record<string, number>>>(
        (carry, [competition_key, team_group_map]) => {
          carry[competition_key] = Object.entries(team_group_map).reduce<
            Record<string, number>
          >((group_carry, [team_id, group_number]) => {
            group_carry[team_id] = Math.max(1, group_number);
            return group_carry;
          }, {});
          return carry;
        },
        {},
      ),
      group_order_by_competition_key: Object.entries(
        this.form_values.group_order_by_competition_key,
      ).reduce<
        Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft>
      >((carry, [competition_key, group_team_ids_by_group_number]) => {
        carry[competition_key] = Object.entries(
          group_team_ids_by_group_number,
        ).reduce<ChampionshipBracketGroupOrderedTeamIdsByGroupNumberDraft>(
          (groupCarry, [group_number, team_ids]) => {
            const resolvedTeamIds = [...new Set(team_ids)];

            if (resolvedTeamIds.length == 0) {
              return groupCarry;
            }

            groupCarry[group_number] = resolvedTeamIds;
            return groupCarry;
          },
          {},
        );

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
          location_template_id: schedule_location.location_template_id,
          name: schedule_location.name,
          position: schedule_location.position,
          courts: schedule_location.courts.map((schedule_court) => {
            const normalizedSportIds = [...new Set(schedule_court.sport_ids)];

            const sportPreference = schedule_court.sport_preference;

            return {
              id: schedule_court.id,
              name: schedule_court.name,
              position: schedule_court.position,
              sport_ids: normalizedSportIds,

              sport_preference:
                sportPreference &&
                normalizedSportIds.includes(sportPreference.preferred_sport_id)
                  ? {
                      preferred_sport_id: sportPreference.preferred_sport_id,

                      preferred_naipe: sportPreference.preferred_naipe ?? null,

                      preferred_division:
                        this.form_values.season_settings.division_format ==
                        ChampionshipSeasonDivisionFormat.SEPARATED
                          ? (sportPreference.preferred_division ?? null)
                          : null,

                      sequence_mode: resolveCourtSequenceModeValue(
                        sportPreference.sequence_mode,
                      ),

                      alternate_naipe_after_exclusive_knockout_phase:
                        sportPreference.alternate_naipe_after_exclusive_knockout_phase ===
                        true,
                    }
                  : null,

              sport_match_targets: resolveScheduleCourtSportMatchTargets(
                schedule_court.sport_match_targets,
                normalizedSportIds,
              ),
            };
          }),
        })),
      })),
      competition_date_availability: resolveCompetitionDateAvailability(
        this.form_values.competition_date_availability,
      ),
      team_competition_date_availability:
        resolveTeamCompetitionDateAvailability(
          this.form_values.team_competition_date_availability,
        ),
      individual_event_configs: this.form_values.individual_event_configs.map(
        (configItem) => ({
          sport_id: configItem.sport_id,
          placements_count: configItem.placements_count,
          placement_points: configItem.placement_points.map(
            (placementPoint) => ({
              placement: placementPoint.placement,
              points: placementPoint.points,
            }),
          ),
          relay_multiplier: configItem.relay_multiplier,
        }),
      ),
      individual_session_configs:
        this.form_values.individual_session_configs.map((sessionConfig) => ({
          sport_id: sessionConfig.sport_id,
          naipe: sessionConfig.naipe,
          division: sessionConfig.division,
          scheduled_date: sessionConfig.scheduled_date,
          start_time: sessionConfig.start_time,
          end_time: sessionConfig.end_time,
          location_key: sessionConfig.location_key,
          court_key: sessionConfig.court_key,
          location_name: sessionConfig.location_name,
          court_name: sessionConfig.court_name,
          exclusive_lock_enabled: sessionConfig.exclusive_lock_enabled == true,
        })),
      resource_locks: this.form_values.resource_locks.map((resourceLock) => ({
        date: resourceLock.date,
        start_time: resourceLock.start_time,
        end_time: resourceLock.end_time,
        location_key: resourceLock.location_key,
        court_key: resourceLock.court_key,
        location_name: resourceLock.location_name,
        court_name: resourceLock.court_name,
        lock_mode: resourceLock.lock_mode,
        competition_key: resourceLock.competition_key ?? null,
        sport_id: resourceLock.sport_id ?? null,
        naipe: resourceLock.naipe ?? null,
        division: resourceLock.division ?? null,
      })),
      match_numbering_mode: resolveMatchNumberingModeValue(
        this.form_values.match_numbering_mode,
      ),
      knockout_program_blocks: this.form_values.knockout_program_blocks.map(
        (programBlock, programBlockIndex) => ({
          date: programBlock.date,
          start_time: programBlock.start_time,
          end_time: programBlock.end_time,
          location_key: programBlock.location_key,
          court_key: programBlock.court_key,
          location_name: programBlock.location_name,
          court_name: programBlock.court_name,
          sport_id: programBlock.sport_id,
          phase: "FINAL" as const,
          division_scope: programBlock.division_scope,
          naipe_sequence: [...new Set(programBlock.naipe_sequence)],
          match_duration_minutes_override:
            programBlock.match_duration_minutes_override ?? null,
          display_order: programBlockIndex + 1,
        }),
      ),
      exact_preview_cache: this.form_values.exact_preview_cache
        ? {
            payload_signature:
              this.form_values.exact_preview_cache.payload_signature,
            generated_at: this.form_values.exact_preview_cache.generated_at,
            result: this.form_values.exact_preview_cache.result,
          }
        : null,
    };
  }
}
