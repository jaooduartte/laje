import { CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP } from "@/domain/championship-brackets/championshipBracket.constants";
import { resolveFixedTimeRangeInterval } from "@/domain/championship-brackets/championshipBracketFixedTimeRange";
import {
  sanitizeGroupAssignments,
  sanitizeGroupOrderedTeamIdsByGroupNumber,
} from "@/domain/championship-brackets/championshipBracketGroupEditor";
import { resolveDefaultCompetitionKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
import type {
  ChampionshipBracketCompetitionDateAvailabilityInput,
  ChampionshipBracketCompetitionConfigDraft,
  ChampionshipBracketCourtSequenceMode,
  ChampionshipBracketTeamCompetitionDateAvailabilityInput,
  ChampionshipSeasonSettingsInput,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipSport, Team } from "@/lib/types";
import {
  ChampionshipSeasonDivisionFormat,
  ChampionshipSportNaipeMode,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";

const COMPETITION_DIVISION_WITHOUT_DIVISION = "WITHOUT_DIVISION";
const INDIVIDUAL_SPORT_NAMES = new Set(["atletismo", "natacao"]);

interface SanitizeChampionshipBracketWizardDraftOptions {
  draftFormValues: ChampionshipBracketWizardDraftFormValues;
  teams: Team[];
  championshipSports: ChampionshipSport[];
  seasonSettings: ChampionshipSeasonSettingsInput;
}

interface WizardCompetitionOption {
  key: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
}

function resolveIsIndividualSportName(sportName: string) {
  const normalizedSportName = sportName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return INDIVIDUAL_SPORT_NAMES.has(normalizedSportName);
}

function resolveCompetitionKey(
  sportId: string,
  naipe: MatchNaipe,
  division: TeamDivision | null,
): string {
  return [
    sportId,
    naipe,
    division ?? COMPETITION_DIVISION_WITHOUT_DIVISION,
  ].join("::");
}

function resolveSupportedNaipesByMode(
  naipeMode: ChampionshipSportNaipeMode,
): MatchNaipe[] {
  if (naipeMode == ChampionshipSportNaipeMode.MISTO) {
    return [MatchNaipe.MISTO];
  }

  return [MatchNaipe.MASCULINO, MatchNaipe.FEMININO];
}

function resolveDefaultCompetitionConfig(
  participantCount: number,
  competitionOption: WizardCompetitionOption | null,
): ChampionshipBracketCompetitionConfigDraft {
  return {
    groups_count: Math.max(1, Math.min(2, participantCount)),
    qualifiers_per_group: CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP,
    should_complete_knockout_with_best_second_placed_teams: true,
    knockout_pairing_mode: competitionOption
      ? resolveDefaultCompetitionKnockoutPairingMode()
      : "LINEAR",
  };
}

function resolveUsesSeparatedDivisions(
  seasonSettings: ChampionshipSeasonSettingsInput,
) {
  return (
    seasonSettings.division_format == ChampionshipSeasonDivisionFormat.SEPARATED
  );
}

export function resolveSelectableChampionshipTeams(
  teams: Team[],
  seasonSettings: ChampionshipSeasonSettingsInput,
) {
  return teams.filter((team) => {
    const hasCompetitiveDivision =
      team.division == TeamDivision.DIVISAO_PRINCIPAL ||
      team.division == TeamDivision.DIVISAO_ACESSO;

    if (!hasCompetitiveDivision) {
      return false;
    }

    if (!resolveUsesSeparatedDivisions(seasonSettings)) {
      return true;
    }

    return hasCompetitiveDivision;
  });
}

function resolveEnabledSportIds(
  draftFormValues: ChampionshipBracketWizardDraftFormValues,
  championshipSports: ChampionshipSport[],
) {
  const championshipSportIdSet = new Set(
    championshipSports.map((championshipSport) => championshipSport.sport_id),
  );

  return [
    ...new Set(
      (draftFormValues.enabled_sport_ids ?? []).filter((sportId) =>
        championshipSportIdSet.has(sportId),
      ),
    ),
  ];
}

function resolveCompetitionOptionsByTeamId({
  teams,
  championshipSports,
  seasonSettings,
  enabledSportIds,
}: {
  teams: Team[];
  championshipSports: ChampionshipSport[];
  seasonSettings: ChampionshipSeasonSettingsInput;
  enabledSportIds: string[];
}) {
  const usesSeparatedDivisions = resolveUsesSeparatedDivisions(seasonSettings);
  const enabledSportIdSet = new Set(enabledSportIds);

  return teams.reduce<Record<string, WizardCompetitionOption[]>>(
    (carry, team) => {
      const teamDivision = usesSeparatedDivisions ? team.division : null;

      if (usesSeparatedDivisions && teamDivision == null) {
        carry[team.id] = [];
        return carry;
      }

      carry[team.id] = championshipSports.flatMap((championshipSport) => {
        if (!enabledSportIdSet.has(championshipSport.sport_id)) {
          return [];
        }

        const sportName = championshipSport.sports?.name ?? "Modalidade";

        return resolveSupportedNaipesByMode(championshipSport.naipe_mode).map(
          (naipe) => ({
            key: resolveCompetitionKey(
              championshipSport.sport_id,
              naipe,
              teamDivision,
            ),
            sport_id: championshipSport.sport_id,
            sport_name: sportName,
            naipe,
            division: teamDivision,
          }),
        );
      });

      return carry;
    },
    {},
  );
}

export function sanitizeCompetitionDateAvailabilityValues({
  scheduleDays,
  competitionKeys,
  competitionDateAvailability,
}: {
  scheduleDays: ChampionshipBracketWizardDraftFormValues["schedule_days"];
  competitionKeys: string[];
  competitionDateAvailability: NonNullable<
    ChampionshipBracketWizardDraftFormValues["competition_date_availability"]
  >;
}): NonNullable<
  ChampionshipBracketWizardDraftFormValues["competition_date_availability"]
> {
  const validCompetitionKeySet = new Set(competitionKeys);
  const scheduleDayDates = [
    ...new Set(
      scheduleDays.map((scheduleDay) => scheduleDay.date).filter(Boolean),
    ),
  ];
  const validScheduleDayDateSet = new Set(scheduleDayDates);

  const availabilityByKey = new Map<
    string,
    ChampionshipBracketCompetitionDateAvailabilityInput
  >(
    competitionDateAvailability
      .filter(
        (availabilityItem) =>
          validCompetitionKeySet.has(availabilityItem.competition_key) &&
          validScheduleDayDateSet.has(availabilityItem.date),
      )
      .map((availabilityItem) => [
        `${availabilityItem.competition_key}::${availabilityItem.date}`,
        availabilityItem,
      ]),
  );

  return competitionKeys.flatMap((competitionKey) =>
    scheduleDayDates.map((date) => {
      const existingAvailability = availabilityByKey.get(
        `${competitionKey}::${date}`,
      );

      const mode =
        existingAvailability?.mode == "UNAVAILABLE" ||
        existingAvailability?.mode == "CUSTOM" ||
        existingAvailability?.mode == "FULL_DAY"
          ? existingAvailability.mode
          : "FULL_DAY";

      return {
        competition_key: competitionKey,
        date,
        mode,
        windows:
          mode == "CUSTOM"
            ? (existingAvailability?.windows ?? []).map((window) => ({
                start_time: window.start_time,
                end_time: window.end_time,
              }))
            : [],
      };
    }),
  );
}

function resolveIsCompetitionPlayableOnScheduleDate({
  competitionOption,
  scheduleDate,
  competitionDateAvailabilityByKey,
}: {
  competitionOption: WizardCompetitionOption;
  scheduleDate: string;
  competitionDateAvailabilityByKey: Map<
    string,
    ChampionshipBracketCompetitionDateAvailabilityInput
  >;
}) {
  if (!scheduleDate) {
    return true;
  }

  const availabilityItem = competitionDateAvailabilityByKey.get(
    `${competitionOption.key}::${scheduleDate}`,
  );

  if (!availabilityItem || availabilityItem.mode == "FULL_DAY") {
    return true;
  }

  if (availabilityItem.mode == "UNAVAILABLE") {
    return false;
  }

  return availabilityItem.windows.some(
    (window) => window.start_time < window.end_time,
  );
}

export function sanitizeTeamCompetitionDateAvailabilityValues({
  scheduleDays,
  teamCompetitionKeysByTeamId,
  teamCompetitionDateAvailability,
}: {
  scheduleDays: ChampionshipBracketWizardDraftFormValues["schedule_days"];
  teamCompetitionKeysByTeamId: Record<string, string[]>;
  teamCompetitionDateAvailability: NonNullable<
    ChampionshipBracketWizardDraftFormValues["team_competition_date_availability"]
  >;
}): NonNullable<
  ChampionshipBracketWizardDraftFormValues["team_competition_date_availability"]
> {
  const scheduleDayDates = [
    ...new Set(
      scheduleDays.map((scheduleDay) => scheduleDay.date).filter(Boolean),
    ),
  ];
  const validScheduleDayDateSet = new Set(scheduleDayDates);

  const validTeamCompetitionKeySet = new Set(
    Object.entries(teamCompetitionKeysByTeamId).flatMap(
      ([teamId, competitionKeys]) =>
        competitionKeys.map(
          (competitionKey) => `${teamId}::${competitionKey}`,
        ),
    ),
  );

  const availabilityByKey = new Map<
    string,
    ChampionshipBracketTeamCompetitionDateAvailabilityInput
  >(
    teamCompetitionDateAvailability
      .filter(
        (availabilityItem) =>
          validTeamCompetitionKeySet.has(
            `${availabilityItem.team_id}::${availabilityItem.competition_key}`,
          ) && validScheduleDayDateSet.has(availabilityItem.date),
      )
      .map((availabilityItem) => [
        `${availabilityItem.team_id}::${availabilityItem.competition_key}::${availabilityItem.date}`,
        availabilityItem,
      ]),
  );

  return Object.entries(teamCompetitionKeysByTeamId).flatMap(
    ([teamId, competitionKeys]) =>
      competitionKeys.flatMap((competitionKey) =>
        scheduleDayDates.map((date) => {
          const existingAvailability = availabilityByKey.get(
            `${teamId}::${competitionKey}::${date}`,
          );

          const mode =
            existingAvailability?.mode == "UNAVAILABLE" ||
            existingAvailability?.mode == "CUSTOM" ||
            existingAvailability?.mode == "FULL_DAY"
              ? existingAvailability.mode
              : "FULL_DAY";

          return {
            team_id: teamId,
            competition_key: competitionKey,
            date,
            mode,
            windows:
              mode == "CUSTOM"
                ? (existingAvailability?.windows ?? []).map((window) => ({
                    start_time: window.start_time,
                    end_time: window.end_time,
                  }))
                : [],
          };
        }),
      ),
  );
}

export const DEFAULT_INDIVIDUAL_EVENT_PLACEMENT_POINTS = [
  24, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
] as const;

function sanitizeIndividualPlacementPointsValues({
  placementPoints,
  placementsCount,
}: {
  placementPoints:
    | ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number]["placement_points"]
    | unknown;
  placementsCount: number;
}) {
  const normalizedPlacementsCount = Math.max(1, Math.trunc(placementsCount));
  const parsedPlacementPoints = Array.isArray(placementPoints)
    ? placementPoints
    : [];
  const placementPointByPlacement = new Map<number, number | null>();

  parsedPlacementPoints.forEach((placementPoint) => {
    if (
      !placementPoint ||
      typeof placementPoint != "object" ||
      Array.isArray(placementPoint)
    ) {
      return;
    }

    const parsedPlacement =
      typeof placementPoint.placement == "number"
        ? Math.trunc(placementPoint.placement)
        : Number.NaN;
    const parsedPoints =
      typeof placementPoint.points == "number" && placementPoint.points >= 0
        ? placementPoint.points
        : placementPoint.points == null
          ? null
          : Number.NaN;

    if (
      Number.isNaN(parsedPlacement) ||
      parsedPlacement < 1 ||
      parsedPlacement > normalizedPlacementsCount ||
      Number.isNaN(parsedPoints) ||
      placementPointByPlacement.has(parsedPlacement)
    ) {
      return;
    }

    placementPointByPlacement.set(parsedPlacement, parsedPoints);
  });

  return Array.from({ length: normalizedPlacementsCount }, (_, index) => {
    const placement = index + 1;
    const defaultPoints =
      DEFAULT_INDIVIDUAL_EVENT_PLACEMENT_POINTS[index] ?? null;

    return {
      placement,
      points: placementPointByPlacement.has(placement)
        ? (placementPointByPlacement.get(placement) ?? null)
        : defaultPoints,
    };
  });
}

export function sanitizeIndividualEventConfigValue(
  configItem: Partial<
    ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number]
  > & {
    scoring_mode?: unknown;
  },
) {
  const placementsCount =
    typeof configItem.placements_count == "number" &&
    configItem.placements_count > 0
      ? Math.trunc(configItem.placements_count)
      : DEFAULT_INDIVIDUAL_EVENT_PLACEMENT_POINTS.length;

  return {
    sport_id: configItem.sport_id ?? "",
    placements_count: placementsCount,
    placement_points: sanitizeIndividualPlacementPointsValues({
      placementPoints: configItem.placement_points,
      placementsCount,
    }),
    relay_multiplier:
      typeof configItem.relay_multiplier == "number" &&
      configItem.relay_multiplier > 0
        ? configItem.relay_multiplier
        : 2,
  } satisfies ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number];
}

export function sanitizeIndividualEventConfigsValues({
  individualSports,
  individualEventConfigs,
}: {
  individualSports: Array<{ sport_id: string }>;
  individualEventConfigs: ChampionshipBracketWizardDraftFormValues["individual_event_configs"];
}) {
  const validSportIdSet = new Set(
    individualSports.map((sport) => sport.sport_id),
  );
  const configBySportId = new Map(
    individualEventConfigs
      .filter((configItem) => validSportIdSet.has(configItem.sport_id))
      .map((configItem) => [configItem.sport_id, configItem]),
  );

  return individualSports.map((sport) => {
    const existingConfig = configBySportId.get(sport.sport_id);

    return sanitizeIndividualEventConfigValue({
      ...existingConfig,
      sport_id: sport.sport_id,
    });
  });
}

export function sanitizeIndividualSessionConfigsValues({
  scheduleDays,
  individualCompetitionOptions,
  individualSessionConfigs,
}: {
  scheduleDays: ChampionshipBracketWizardDraftFormValues["schedule_days"];
  individualCompetitionOptions: WizardCompetitionOption[];
  individualSessionConfigs: ChampionshipBracketWizardDraftFormValues["individual_session_configs"];
}) {
  const scheduleDayByDate = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.date, scheduleDay]),
  );
  const configByKey = new Map(
    individualSessionConfigs.map((sessionConfig) => [
      resolveCompetitionKey(
        sessionConfig.sport_id,
        sessionConfig.naipe,
        sessionConfig.division,
      ),
      sessionConfig,
    ]),
  );

  return individualCompetitionOptions.map((competitionOption) => {
    const existingConfig =
      configByKey.get(
        resolveCompetitionKey(
          competitionOption.sport_id,
          competitionOption.naipe,
          competitionOption.division,
        ),
      ) ?? null;
    const scheduleDay = existingConfig?.scheduled_date
      ? (scheduleDayByDate.get(existingConfig.scheduled_date) ?? null)
      : null;
    return {
      sport_id: competitionOption.sport_id,
      naipe: competitionOption.naipe,
      division: competitionOption.division,
      scheduled_date: scheduleDay ? (existingConfig?.scheduled_date ?? null) : null,
      start_time: scheduleDay ? (existingConfig?.start_time ?? null) : null,
      end_time: scheduleDay ? (existingConfig?.end_time ?? null) : null,
      location_key: scheduleDay ? (existingConfig?.location_key ?? null) : null,
      court_key: scheduleDay ? (existingConfig?.court_key ?? null) : null,
      location_name: scheduleDay
        ? (existingConfig?.location_name ?? null)
        : null,
      court_name: scheduleDay ? (existingConfig?.court_name ?? null) : null,
      exclusive_lock_enabled: existingConfig?.exclusive_lock_enabled == true,
    };
  });
}

export function sanitizeResourceLocksValues({
  scheduleDays,
  resourceLocks,
}: {
  scheduleDays: ChampionshipBracketWizardDraftFormValues["schedule_days"];
  resourceLocks: ChampionshipBracketWizardDraftFormValues["resource_locks"];
}) {
  const scheduleDayByDate = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.date, scheduleDay]),
  );

  return resourceLocks.filter((resourceLock) => {
    const scheduleDay = scheduleDayByDate.get(resourceLock.date);

    return (
      scheduleDay != null &&
      resourceLock.location_key &&
      resourceLock.court_key
    );
  });
}

export function resolveAutomaticKnockoutProgramNaipeSequence(
  availableNaipes: MatchNaipe[],
) {
  const orderedNaipes = [
    MatchNaipe.FEMININO,
    MatchNaipe.MASCULINO,
    MatchNaipe.MISTO,
  ];

  return orderedNaipes.filter((naipe) => availableNaipes.includes(naipe));
}

function resolveCourtSequenceModeValue(
  value: unknown,
): ChampionshipBracketCourtSequenceMode {
  switch (value) {
    case "GROUP_NAIPE":
      return "GROUP_NAIPE";

    case "ALTERNATE_NAIPE":
      return "ALTERNATE_NAIPE";

    case "GROUP_DIVISION":
      return "GROUP_DIVISION";

    case "FLEXIBLE":
    default:
      return "FLEXIBLE";
  }
}

function sanitizeScheduleDaysValues({
  scheduleDays,
  seasonSettings,
  collectiveCompetitionOptions,
  competitionDateAvailability = [],
}: {
  scheduleDays: ChampionshipBracketWizardDraftFormValues["schedule_days"];
  seasonSettings: ChampionshipSeasonSettingsInput;
  collectiveCompetitionOptions: WizardCompetitionOption[];
  competitionDateAvailability?: NonNullable<
    ChampionshipBracketWizardDraftFormValues["competition_date_availability"]
  >;
}): ChampionshipBracketWizardDraftFormValues["schedule_days"] {
  const competitionOptionsBySportId = collectiveCompetitionOptions.reduce<
    Record<string, WizardCompetitionOption[]>
  >((carry, competitionOption) => {
    if (!carry[competitionOption.sport_id]) {
      carry[competitionOption.sport_id] = [];
    }

    carry[competitionOption.sport_id].push(competitionOption);

    return carry;
  }, {});
  const competitionDateAvailabilityByKey = new Map(
    competitionDateAvailability.map((availabilityItem) => [
      `${availabilityItem.competition_key}::${availabilityItem.date}`,
      availabilityItem,
    ]),
  );

  return scheduleDays.map((scheduleDay) => ({
    ...scheduleDay,

    locations: scheduleDay.locations.map((scheduleLocation) => ({
      ...scheduleLocation,

      courts: scheduleLocation.courts.map((court) => {
        const normalizedSportIds = [...new Set(court.sport_ids)];

        const sportMatchTargets = (court.sport_match_targets ?? []).filter(
          (target) =>
            (competitionOptionsBySportId[target.sport_id] ?? []).some(
              (competitionOption) =>
                normalizedSportIds.includes(target.sport_id) &&
                resolveIsCompetitionPlayableOnScheduleDate({
                  competitionOption,
                  scheduleDate: scheduleDay.date,
                  competitionDateAvailabilityByKey,
                }),
            ),
        );

        const sportPreference = court.sport_preference;

        if (
          !sportPreference ||
          !normalizedSportIds.includes(sportPreference.preferred_sport_id)
        ) {
          return {
            ...court,
            sport_ids: normalizedSportIds,
            sport_match_targets: sportMatchTargets,
            sport_preference: null,
          };
        }

        const preferredSportOptions =
          (competitionOptionsBySportId[
            sportPreference.preferred_sport_id
          ] ?? []).filter((competitionOption) =>
            resolveIsCompetitionPlayableOnScheduleDate({
              competitionOption,
              scheduleDate: scheduleDay.date,
              competitionDateAvailabilityByKey,
            }),
          );

        if (preferredSportOptions.length == 0) {
          return {
            ...court,
            sport_ids: normalizedSportIds,
            sport_match_targets: sportMatchTargets,
            sport_preference: null,
          };
        }

        const availableNaipes = [
          ...new Set(
            preferredSportOptions.map(
              (competitionOption) => competitionOption.naipe,
            ),
          ),
        ];

        const availableDivisions = [
          ...new Set(
            preferredSportOptions
              .map((competitionOption) => competitionOption.division)
              .filter((division): division is TeamDivision => division != null),
          ),
        ];

        const preferredNaipe =
          sportPreference.preferred_naipe != null &&
          availableNaipes.includes(sportPreference.preferred_naipe)
            ? sportPreference.preferred_naipe
            : null;

        const preferredDivision =
          seasonSettings.division_format ==
            ChampionshipSeasonDivisionFormat.SEPARATED &&
          sportPreference.preferred_division != null &&
          availableDivisions.includes(sportPreference.preferred_division)
            ? sportPreference.preferred_division
            : null;

        let sequenceMode = resolveCourtSequenceModeValue(
          sportPreference.sequence_mode,
        );

        if (
          (sequenceMode == "GROUP_NAIPE" ||
            sequenceMode == "ALTERNATE_NAIPE") &&
          (preferredNaipe == null || availableNaipes.length < 2)
        ) {
          sequenceMode = "FLEXIBLE";
        }

        if (
          sequenceMode == "GROUP_DIVISION" &&
          (seasonSettings.division_format !=
            ChampionshipSeasonDivisionFormat.SEPARATED ||
            preferredDivision == null ||
            availableDivisions.length < 2)
        ) {
          sequenceMode = "FLEXIBLE";
        }

        let nextPreferredNaipe = preferredNaipe;

        let nextPreferredDivision = preferredDivision;

        if (
          sequenceMode == "GROUP_NAIPE" ||
          sequenceMode == "ALTERNATE_NAIPE"
        ) {
          nextPreferredDivision = null;
        }

        if (sequenceMode == "GROUP_DIVISION") {
          nextPreferredNaipe = null;
        }

        const shouldAlternateNaipeAfterExclusiveKnockoutPhase =
          sequenceMode == "GROUP_NAIPE" &&
          availableNaipes.length == 2 &&
          sportPreference.alternate_naipe_after_exclusive_knockout_phase ===
            true;

        const hasExactPreferenceCombination =
          nextPreferredNaipe == null ||
          nextPreferredDivision == null ||
          preferredSportOptions.some(
            (competitionOption) =>
              competitionOption.naipe == nextPreferredNaipe &&
              competitionOption.division == nextPreferredDivision,
          );

        if (!hasExactPreferenceCombination) {
          nextPreferredDivision = null;
        }

        return {
          ...court,
          sport_ids: normalizedSportIds,
          sport_match_targets: sportMatchTargets,

          sport_preference: {
            preferred_sport_id: sportPreference.preferred_sport_id,

            preferred_naipe: nextPreferredNaipe,

            preferred_division: nextPreferredDivision,

            sequence_mode: sequenceMode,

            alternate_naipe_after_exclusive_knockout_phase:
              shouldAlternateNaipeAfterExclusiveKnockoutPhase,
          },
        };
      }),
    })),
  }));
}

export function sanitizeKnockoutProgramBlocksValues({
  scheduleDays,
  seasonSettings,
  collectiveCompetitionOptions,
  knockoutProgramBlocks,
}: {
  scheduleDays: ChampionshipBracketWizardDraftFormValues["schedule_days"];
  seasonSettings: ChampionshipSeasonSettingsInput;
  collectiveCompetitionOptions: WizardCompetitionOption[];
  knockoutProgramBlocks: ChampionshipBracketWizardDraftFormValues["knockout_program_blocks"];
}) {
  const scheduleDayByDate = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.date, scheduleDay]),
  );
  const competitionOptionsBySportId = collectiveCompetitionOptions.reduce<
    Record<string, WizardCompetitionOption[]>
  >((carry, competitionOption) => {
    if (!carry[competitionOption.sport_id]) {
      carry[competitionOption.sport_id] = [];
    }

    carry[competitionOption.sport_id].push(competitionOption);
    return carry;
  }, {});
  return knockoutProgramBlocks
    .filter((block) => {
      const scheduleDay = scheduleDayByDate.get(block.date);

      return (
        scheduleDay != null &&
        block.location_key &&
        block.court_key &&
        block.sport_id &&
        Array.isArray(competitionOptionsBySportId[block.sport_id]) &&
        competitionOptionsBySportId[block.sport_id].length > 0
      );
    })
    .flatMap((block, index) => {
      const sportCompetitionOptions =
        competitionOptionsBySportId[block.sport_id] ?? [];
      const availableNaipes = [
        ...new Set(
          sportCompetitionOptions
            .filter((competitionOption) => {
              if (
                seasonSettings.division_format ==
                ChampionshipSeasonDivisionFormat.UNIFIED
              ) {
                return true;
              }

              if (block.division_scope == "ALL") {
                return true;
              }

              return competitionOption.division == block.division_scope;
            })
            .map((competitionOption) => competitionOption.naipe),
        ),
      ];
      const fallbackNaipeSequence =
        resolveAutomaticKnockoutProgramNaipeSequence(availableNaipes);
      const nextNaipeSequence = [
        ...new Set(
          block.naipe_sequence.filter((naipe) =>
            availableNaipes.includes(naipe),
          ),
        ),
      ];

      if (nextNaipeSequence.length == 0 && fallbackNaipeSequence.length == 0) {
        return [];
      }

      return [
        {
          date: block.date,
          start_time: block.start_time,
          end_time: block.end_time,
          location_key: block.location_key,
          court_key: block.court_key,
          location_name: block.location_name ?? null,
          court_name: block.court_name ?? null,
          sport_id: block.sport_id,
          phase: "FINAL" as const,
          division_scope:
            seasonSettings.division_format ==
            ChampionshipSeasonDivisionFormat.UNIFIED
              ? "ALL"
              : (block.division_scope ?? "ALL"),
          naipe_sequence:
            nextNaipeSequence.length > 0
              ? nextNaipeSequence
              : fallbackNaipeSequence,

          match_duration_minutes_override:
            typeof block.match_duration_minutes_override == "number" &&
            Number.isInteger(block.match_duration_minutes_override) &&
            block.match_duration_minutes_override > 0
              ? block.match_duration_minutes_override
              : null,

          display_order:
            typeof block.display_order == "number" && block.display_order > 0
              ? Math.trunc(block.display_order)
              : index + 1,
        },
      ];
    })
    .sort((left, right) => left.display_order - right.display_order)
    .map((programBlock, programBlockIndex) => ({
      ...programBlock,
      display_order: programBlockIndex + 1,
    }));
}

export function sanitizeChampionshipBracketWizardDraft({
  draftFormValues,
  teams,
  championshipSports,
  seasonSettings,
}: SanitizeChampionshipBracketWizardDraftOptions): ChampionshipBracketWizardDraftFormValues {
  const enabledSportIds = resolveEnabledSportIds(
    draftFormValues,
    championshipSports,
  );
  const selectableTeamIds = new Set(
    resolveSelectableChampionshipTeams(teams, seasonSettings).map(
      (team) => team.id,
    ),
  );
  const nextSelectedTeamIds = draftFormValues.selected_team_ids.filter(
    (teamId) => selectableTeamIds.has(teamId),
  );
  const selectedTeamIdSet = new Set(nextSelectedTeamIds);
  const selectedTeams = teams.filter((team) => selectedTeamIdSet.has(team.id));
  const competitionOptionsByTeamId = resolveCompetitionOptionsByTeamId({
    teams: selectedTeams,
    championshipSports,
    seasonSettings,
    enabledSportIds,
  });

  const nextSelectedSportIdsByTeamId = Object.entries(
    draftFormValues.selected_sport_ids_by_team_id,
  ).reduce<Record<string, string[]>>((carry, [teamId, selectedSportIds]) => {
    if (!selectedTeamIdSet.has(teamId)) {
      return carry;
    }

    const validSportIds = new Set(
      (competitionOptionsByTeamId[teamId] ?? []).map(
        (competitionOption) => competitionOption.sport_id,
      ),
    );
    const nextSelectedSportIds = [
      ...new Set(
        selectedSportIds.filter((sportId) => validSportIds.has(sportId)),
      ),
    ];

    if (nextSelectedSportIds.length > 0) {
      carry[teamId] = nextSelectedSportIds;
    }

    return carry;
  }, {});

  const nextSelectedCompetitionKeysByTeamId = Object.entries(
    draftFormValues.selected_competition_keys_by_team_id,
  ).reduce<Record<string, string[]>>(
    (carry, [teamId, selectedCompetitionKeys]) => {
      if (!selectedTeamIdSet.has(teamId)) {
        return carry;
      }

      const validCompetitionOptions = competitionOptionsByTeamId[teamId] ?? [];
      const validCompetitionKeys = new Set(
        validCompetitionOptions.map(
          (competitionOption) => competitionOption.key,
        ),
      );
      const validSportIds = new Set(nextSelectedSportIdsByTeamId[teamId] ?? []);
      const nextSelectedCompetitionKeys = [
        ...new Set(
          selectedCompetitionKeys.filter((competitionKey) => {
            if (!validCompetitionKeys.has(competitionKey)) {
              return false;
            }

            const competitionOption = validCompetitionOptions.find(
              (currentCompetitionOption) => {
                return currentCompetitionOption.key == competitionKey;
              },
            );

            return competitionOption
              ? validSportIds.has(competitionOption.sport_id)
              : false;
          }),
        ),
      ];

      if (nextSelectedCompetitionKeys.length > 0) {
        carry[teamId] = nextSelectedCompetitionKeys;
      }

      return carry;
    },
    {},
  );

  const teamIdsByCompetitionKey = Object.entries(
    nextSelectedCompetitionKeysByTeamId,
  ).reduce<Record<string, string[]>>((carry, [teamId, competitionKeys]) => {
    competitionKeys.forEach((competitionKey) => {
      if (!carry[competitionKey]) {
        carry[competitionKey] = [];
      }

      carry[competitionKey].push(teamId);
    });

    return carry;
  }, {});

  const activeCompetitionKeys = Object.keys(teamIdsByCompetitionKey).filter(
    (competitionKey) => {
      return (teamIdsByCompetitionKey[competitionKey] ?? []).length >= 2;
    },
  );
  const competitionOptionsByKey = Object.values(
    competitionOptionsByTeamId,
  ).reduce<Record<string, WizardCompetitionOption>>(
    (carry, competitionOptions) => {
      competitionOptions.forEach((competitionOption) => {
        carry[competitionOption.key] = competitionOption;
      });

      return carry;
    },
    {},
  );
  const selectedSportIdSet = new Set(
    Object.values(nextSelectedSportIdsByTeamId).flatMap((sportIds) => sportIds),
  );
  const selectedIndividualSports = championshipSports
    .filter((championshipSport) => {
      return (
        enabledSportIds.includes(championshipSport.sport_id) &&
        selectedSportIdSet.has(championshipSport.sport_id) &&
        resolveIsIndividualSportName(championshipSport.sports?.name ?? "")
      );
    })
    .map((championshipSport) => ({
      sport_id: championshipSport.sport_id,
    }));
  const individualCompetitionOptions = [
    ...new Map(
      Object.values(competitionOptionsByTeamId)
        .flat()
        .filter(
          (competitionOption) =>
            resolveIsIndividualSportName(competitionOption.sport_name) &&
            Object.values(nextSelectedCompetitionKeysByTeamId)
              .flat()
              .includes(competitionOption.key),
        )
        .map((competitionOption) => [competitionOption.key, competitionOption]),
    ).values(),
  ];
  const collectiveCompetitionOptions = activeCompetitionKeys
    .map((competitionKey) => competitionOptionsByKey[competitionKey] ?? null)
    .filter(
      (competitionOption): competitionOption is WizardCompetitionOption =>
        competitionOption != null &&
        !resolveIsIndividualSportName(competitionOption.sport_name),
    );

  const nextCompetitionDateAvailability =
    draftFormValues.competition_date_availability == null
      ? undefined
      : sanitizeCompetitionDateAvailabilityValues({
          scheduleDays: draftFormValues.schedule_days,
          competitionKeys: activeCompetitionKeys,
          competitionDateAvailability:
            draftFormValues.competition_date_availability,
        });

  const nextScheduleDays = sanitizeScheduleDaysValues({
    scheduleDays: draftFormValues.schedule_days,
    seasonSettings,
    collectiveCompetitionOptions,
    competitionDateAvailability: nextCompetitionDateAvailability ?? [],
  });

  const nextCompetitionConfigByKey = activeCompetitionKeys.reduce<
    Record<string, ChampionshipBracketCompetitionConfigDraft>
  >((carry, competitionKey) => {
    const participantCount =
      teamIdsByCompetitionKey[competitionKey]?.length ?? 2;
    const competitionOption = competitionOptionsByKey[competitionKey] ?? null;
    carry[competitionKey] =
      draftFormValues.competition_config_by_key[competitionKey] ??
      resolveDefaultCompetitionConfig(participantCount, competitionOption);
    return carry;
  }, {});

  const nextGroupAssignmentsByCompetitionKey = activeCompetitionKeys.reduce<
    Record<string, Record<string, number>>
  >((carry, competitionKey) => {
    const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
    const groupsCount =
      nextCompetitionConfigByKey[competitionKey]?.groups_count ?? 1;
    carry[competitionKey] = sanitizeGroupAssignments({
      participant_team_ids: participantTeamIds,
      group_assignments:
        draftFormValues.group_assignments_by_competition_key[competitionKey] ??
        {},
      groups_count: groupsCount,
    });
    return carry;
  }, {});

  const nextGroupOrderByCompetitionKey = activeCompetitionKeys.reduce<
    Record<string, Record<string, string[]>>
  >((carry, competitionKey) => {
    const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
    const groupsCount =
      nextCompetitionConfigByKey[competitionKey]?.groups_count ?? 1;
    const nextGroupOrder = sanitizeGroupOrderedTeamIdsByGroupNumber({
      participant_team_ids: participantTeamIds,
      group_assignments:
        nextGroupAssignmentsByCompetitionKey[competitionKey] ?? {},
      groups_count: groupsCount,
      ordered_team_ids_by_group_number:
        draftFormValues.group_order_by_competition_key[competitionKey] ?? {},
    });

    if (Object.keys(nextGroupOrder).length > 0) {
      carry[competitionKey] = nextGroupOrder;
    }

    return carry;
  }, {});
  const teamCompetitionKeysByTeamId = Object.entries(
    nextSelectedCompetitionKeysByTeamId,
  ).reduce<Record<string, string[]>>((carry, [teamId, competitionKeys]) => {
    const filteredCompetitionKeys = competitionKeys.filter((competitionKey) =>
      activeCompetitionKeys.includes(competitionKey),
    );

    if (filteredCompetitionKeys.length > 0) {
      carry[teamId] = filteredCompetitionKeys;
    }

    return carry;
  }, {});

  return {
    ...draftFormValues,
    enabled_sport_ids: enabledSportIds,
    schedule_days: nextScheduleDays,
    selected_team_ids: nextSelectedTeamIds,
    selected_sport_ids_by_team_id: nextSelectedSportIdsByTeamId,
    selected_competition_keys_by_team_id: nextSelectedCompetitionKeysByTeamId,
    competition_config_by_key: nextCompetitionConfigByKey,
    group_assignments_by_competition_key: nextGroupAssignmentsByCompetitionKey,
    group_order_by_competition_key: nextGroupOrderByCompetitionKey,
    competition_date_availability: nextCompetitionDateAvailability,
    team_competition_date_availability:
      draftFormValues.team_competition_date_availability == null
        ? undefined
        : sanitizeTeamCompetitionDateAvailabilityValues({
            scheduleDays: nextScheduleDays,
            teamCompetitionKeysByTeamId,
            teamCompetitionDateAvailability:
              draftFormValues.team_competition_date_availability,
          }),
    individual_event_configs: sanitizeIndividualEventConfigsValues({
      individualSports: selectedIndividualSports,
      individualEventConfigs: draftFormValues.individual_event_configs ?? [],
    }),
    individual_session_configs: sanitizeIndividualSessionConfigsValues({
      scheduleDays: nextScheduleDays,
      individualCompetitionOptions,
      individualSessionConfigs:
        draftFormValues.individual_session_configs ?? [],
    }),
    resource_locks: sanitizeResourceLocksValues({
      scheduleDays: nextScheduleDays,
      resourceLocks: draftFormValues.resource_locks ?? [],
    }),
    knockout_program_blocks: sanitizeKnockoutProgramBlocksValues({
      scheduleDays: nextScheduleDays,
      seasonSettings,
      collectiveCompetitionOptions,
      knockoutProgramBlocks: draftFormValues.knockout_program_blocks ?? [],
    }),
    exact_preview_cache: draftFormValues.exact_preview_cache ?? null,
  };
}
