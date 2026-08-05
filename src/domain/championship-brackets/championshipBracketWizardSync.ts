import { CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP } from "@/domain/championship-brackets/championshipBracket.constants";
import {
  sanitizeGroupAssignments,
  sanitizeGroupOrderedTeamIdsByGroupNumber,
} from "@/domain/championship-brackets/championshipBracketGroupEditor";
import { resolveDefaultCompetitionKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
import type {
  ChampionshipBracketCompetitionConfigDraft,
  ChampionshipSeasonSettingsInput,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipSport, Team } from "@/lib/types";
import {
  ChampionshipSchedulePeriod,
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
  return [sportId, naipe, division ?? COMPETITION_DIVISION_WITHOUT_DIVISION].join("::");
}

function resolveDatePeriodKey(
  date: string,
  period: ChampionshipSchedulePeriod,
): string {
  return `${date}::${period}`;
}

function resolveSupportedNaipesByMode(naipeMode: ChampionshipSportNaipeMode): MatchNaipe[] {
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
  return seasonSettings.division_format == ChampionshipSeasonDivisionFormat.SEPARATED;
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

  return teams.reduce<Record<string, WizardCompetitionOption[]>>((carry, team) => {
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

      return resolveSupportedNaipesByMode(championshipSport.naipe_mode).map((naipe) => ({
        key: resolveCompetitionKey(championshipSport.sport_id, naipe, teamDivision),
        sport_id: championshipSport.sport_id,
        sport_name: sportName,
        naipe,
        division: teamDivision,
      }));
    });

    return carry;
  }, {});
}

function sanitizeSchedulePeriodsForDates(
  dates: string[],
  schedulePeriods: ChampionshipBracketWizardDraftFormValues["schedule_periods"],
) {
  const schedulePeriodByKey = new Map(
    schedulePeriods.map((schedulePeriod) => [
      resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period),
      schedulePeriod,
    ]),
  );

  return dates.flatMap((date) =>
    [ChampionshipSchedulePeriod.MATUTINO, ChampionshipSchedulePeriod.VESPERTINO].map(
      (period) => {
        const existingSchedulePeriod = schedulePeriodByKey.get(
          resolveDatePeriodKey(date, period),
        );

        return {
          date,
          period,
          enabled: existingSchedulePeriod?.enabled != false,
        };
      },
    ),
  );
}

function sanitizeCompetitionPeriodAvailabilityValues({
  schedulePeriods,
  competitionKeys,
  competitionPeriodAvailability,
}: {
  schedulePeriods: ChampionshipBracketWizardDraftFormValues["schedule_periods"];
  competitionKeys: string[];
  competitionPeriodAvailability: ChampionshipBracketWizardDraftFormValues["competition_period_availability"];
}) {
  const validCompetitionKeySet = new Set(competitionKeys);
  const availabilityByKey = new Map(
    competitionPeriodAvailability
      .filter((availabilityItem) =>
        validCompetitionKeySet.has(availabilityItem.competition_key),
      )
      .map((availabilityItem) => [
        `${availabilityItem.competition_key}::${resolveDatePeriodKey(
          availabilityItem.date,
          availabilityItem.period,
        )}`,
        availabilityItem,
      ]),
  );

  return competitionKeys.flatMap((competitionKey) =>
    schedulePeriods.map((schedulePeriod) => {
      const availabilityKey = `${competitionKey}::${resolveDatePeriodKey(
        schedulePeriod.date,
        schedulePeriod.period,
      )}`;
      const existingAvailability = availabilityByKey.get(availabilityKey);

      return {
        competition_key: competitionKey,
        date: schedulePeriod.date,
        period: schedulePeriod.period,
        enabled: existingAvailability?.enabled != false,
      };
    }),
  );
}

function sanitizeTeamCompetitionAvailabilityValues({
  schedulePeriods,
  teamCompetitionKeysByTeamId,
  teamCompetitionAvailability,
}: {
  schedulePeriods: ChampionshipBracketWizardDraftFormValues["schedule_periods"];
  teamCompetitionKeysByTeamId: Record<string, string[]>;
  teamCompetitionAvailability: ChampionshipBracketWizardDraftFormValues["team_competition_availability"];
}) {
  const validTeamCompetitionKeySet = new Set(
    Object.entries(teamCompetitionKeysByTeamId).flatMap(([teamId, competitionKeys]) =>
      competitionKeys.map((competitionKey) => `${teamId}::${competitionKey}`),
    ),
  );
  const availabilityByKey = new Map(
    teamCompetitionAvailability
      .filter((availabilityItem) =>
        validTeamCompetitionKeySet.has(
          `${availabilityItem.team_id}::${availabilityItem.competition_key}`,
        ),
      )
      .map((availabilityItem) => [
        `${availabilityItem.team_id}::${availabilityItem.competition_key}::${resolveDatePeriodKey(
          availabilityItem.date,
          availabilityItem.period,
        )}`,
        availabilityItem,
      ]),
  );

  return Object.entries(teamCompetitionKeysByTeamId).flatMap(
    ([teamId, competitionKeys]) =>
      competitionKeys.flatMap((competitionKey) =>
        schedulePeriods.map((schedulePeriod) => {
          const availabilityKey = `${teamId}::${competitionKey}::${resolveDatePeriodKey(
            schedulePeriod.date,
            schedulePeriod.period,
          )}`;
          const existingAvailability = availabilityByKey.get(availabilityKey);

          return {
            team_id: teamId,
            competition_key: competitionKey,
            date: schedulePeriod.date,
            period: schedulePeriod.period,
            enabled: existingAvailability?.enabled != false,
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
  placementPoints: ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number]["placement_points"] | unknown;
  placementsCount: number;
}) {
  const normalizedPlacementsCount = Math.max(1, Math.trunc(placementsCount));
  const parsedPlacementPoints = Array.isArray(placementPoints) ? placementPoints : [];
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
        ? placementPointByPlacement.get(placement) ?? null
        : defaultPoints,
    };
  });
}

export function sanitizeIndividualEventConfigValue(
  configItem: Partial<ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number]> & {
    scoring_mode?: unknown;
  },
) {
  const placementsCount =
    typeof configItem.placements_count == "number" && configItem.placements_count > 0
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
      typeof configItem.relay_multiplier == "number" && configItem.relay_multiplier > 0
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
  const validSportIdSet = new Set(individualSports.map((sport) => sport.sport_id));
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
  schedulePeriods,
  individualCompetitionOptions,
  individualSessionConfigs,
}: {
  schedulePeriods: ChampionshipBracketWizardDraftFormValues["schedule_periods"];
  individualCompetitionOptions: WizardCompetitionOption[];
  individualSessionConfigs: ChampionshipBracketWizardDraftFormValues["individual_session_configs"];
}) {
  const enabledDatePeriodKeySet = new Set(
    schedulePeriods
      .filter((schedulePeriod) => schedulePeriod.enabled != false)
      .map((schedulePeriod) =>
        resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period),
      ),
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
    const hasValidSlot =
      existingConfig?.scheduled_date &&
      existingConfig.period &&
      enabledDatePeriodKeySet.has(
        resolveDatePeriodKey(existingConfig.scheduled_date, existingConfig.period),
      );

    return {
      sport_id: competitionOption.sport_id,
      naipe: competitionOption.naipe,
      division: competitionOption.division,
      scheduled_date: hasValidSlot ? existingConfig?.scheduled_date ?? null : null,
      period: hasValidSlot ? existingConfig?.period ?? null : null,
      location_key: hasValidSlot ? existingConfig?.location_key ?? null : null,
      court_key: hasValidSlot ? existingConfig?.court_key ?? null : null,
      location_name: hasValidSlot ? existingConfig?.location_name ?? null : null,
      court_name: hasValidSlot ? existingConfig?.court_name ?? null : null,
      exclusive_lock_enabled: existingConfig?.exclusive_lock_enabled == true,
    };
  });
}

export function sanitizeResourceLocksValues({
  schedulePeriods,
  resourceLocks,
}: {
  schedulePeriods: ChampionshipBracketWizardDraftFormValues["schedule_periods"];
  resourceLocks: ChampionshipBracketWizardDraftFormValues["resource_locks"];
}) {
  const enabledDatePeriodKeySet = new Set(
    schedulePeriods.map((schedulePeriod) =>
      resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period),
    ),
  );

  return resourceLocks.filter((resourceLock) => {
    return (
      resourceLock.location_key &&
      resourceLock.court_key &&
      enabledDatePeriodKeySet.has(
        resolveDatePeriodKey(resourceLock.date, resourceLock.period),
      )
    );
  });
}

function resolveDefaultKnockoutProgramNaipeSequence(
  availableNaipes: MatchNaipe[],
) {
  const orderedNaipes = [
    MatchNaipe.FEMININO,
    MatchNaipe.MASCULINO,
    MatchNaipe.MISTO,
  ];

  return orderedNaipes.filter((naipe) => availableNaipes.includes(naipe));
}

export function sanitizeKnockoutProgramBlocksValues({
  schedulePeriods,
  seasonSettings,
  collectiveCompetitionOptions,
  knockoutProgramBlocks,
}: {
  schedulePeriods: ChampionshipBracketWizardDraftFormValues["schedule_periods"];
  seasonSettings: ChampionshipSeasonSettingsInput;
  collectiveCompetitionOptions: WizardCompetitionOption[];
  knockoutProgramBlocks: ChampionshipBracketWizardDraftFormValues["knockout_program_blocks"];
}) {
  const enabledDatePeriodKeySet = new Set(
    schedulePeriods
      .filter((schedulePeriod) => schedulePeriod.enabled != false)
      .map((schedulePeriod) =>
        resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period),
      ),
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
      return (
        block.location_key &&
        block.court_key &&
        block.sport_id &&
        enabledDatePeriodKeySet.has(
          resolveDatePeriodKey(block.date, block.period),
        ) &&
        Array.isArray(competitionOptionsBySportId[block.sport_id]) &&
        competitionOptionsBySportId[block.sport_id].length > 0
      );
    })
    .map((block, index) => {
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
        resolveDefaultKnockoutProgramNaipeSequence(availableNaipes);
      const nextNaipeSequence = [
        ...new Set(
          block.naipe_sequence.filter((naipe) =>
            availableNaipes.includes(naipe),
          ),
        ),
      ];

      return {
        date: block.date,
        period: block.period,
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
            : block.division_scope ?? "ALL",
        naipe_sequence:
          nextNaipeSequence.length > 0
            ? nextNaipeSequence
            : fallbackNaipeSequence,
        display_order:
          typeof block.display_order == "number" && block.display_order > 0
            ? Math.trunc(block.display_order)
            : index + 1,
      };
    })
    .sort((left, right) => left.display_order - right.display_order);
}

export function sanitizeChampionshipBracketWizardDraft({
  draftFormValues,
  teams,
  championshipSports,
  seasonSettings,
}: SanitizeChampionshipBracketWizardDraftOptions): ChampionshipBracketWizardDraftFormValues {
  const enabledSportIds = resolveEnabledSportIds(draftFormValues, championshipSports);
  const selectableTeamIds = new Set(
    resolveSelectableChampionshipTeams(teams, seasonSettings).map((team) => team.id),
  );
  const nextSelectedTeamIds = draftFormValues.selected_team_ids.filter((teamId) => selectableTeamIds.has(teamId));
  const selectedTeamIdSet = new Set(nextSelectedTeamIds);
  const selectedTeams = teams.filter((team) => selectedTeamIdSet.has(team.id));
  const competitionOptionsByTeamId = resolveCompetitionOptionsByTeamId({
    teams: selectedTeams,
    championshipSports,
    seasonSettings,
    enabledSportIds,
  });

  const nextSelectedSportIdsByTeamId = Object.entries(draftFormValues.selected_sport_ids_by_team_id).reduce<
    Record<string, string[]>
  >((carry, [teamId, selectedSportIds]) => {
    if (!selectedTeamIdSet.has(teamId)) {
      return carry;
    }

    const validSportIds = new Set((competitionOptionsByTeamId[teamId] ?? []).map((competitionOption) => competitionOption.sport_id));
    const nextSelectedSportIds = [...new Set(selectedSportIds.filter((sportId) => validSportIds.has(sportId)))];

    if (nextSelectedSportIds.length > 0) {
      carry[teamId] = nextSelectedSportIds;
    }

    return carry;
  }, {});

  const nextSelectedCompetitionKeysByTeamId = Object.entries(draftFormValues.selected_competition_keys_by_team_id).reduce<
    Record<string, string[]>
  >((carry, [teamId, selectedCompetitionKeys]) => {
    if (!selectedTeamIdSet.has(teamId)) {
      return carry;
    }

    const validCompetitionOptions = competitionOptionsByTeamId[teamId] ?? [];
    const validCompetitionKeys = new Set(validCompetitionOptions.map((competitionOption) => competitionOption.key));
    const validSportIds = new Set(nextSelectedSportIdsByTeamId[teamId] ?? []);
    const nextSelectedCompetitionKeys = [...new Set(
      selectedCompetitionKeys.filter((competitionKey) => {
        if (!validCompetitionKeys.has(competitionKey)) {
          return false;
        }

        const competitionOption = validCompetitionOptions.find((currentCompetitionOption) => {
          return currentCompetitionOption.key == competitionKey;
        });

        return competitionOption ? validSportIds.has(competitionOption.sport_id) : false;
      }),
    )];

    if (nextSelectedCompetitionKeys.length > 0) {
      carry[teamId] = nextSelectedCompetitionKeys;
    }

    return carry;
  }, {});

  const teamIdsByCompetitionKey = Object.entries(nextSelectedCompetitionKeysByTeamId).reduce<Record<string, string[]>>(
    (carry, [teamId, competitionKeys]) => {
      competitionKeys.forEach((competitionKey) => {
        if (!carry[competitionKey]) {
          carry[competitionKey] = [];
        }

        carry[competitionKey].push(teamId);
      });

      return carry;
    },
    {},
  );

  const activeCompetitionKeys = Object.keys(teamIdsByCompetitionKey).filter((competitionKey) => {
    return (teamIdsByCompetitionKey[competitionKey] ?? []).length >= 2;
  });
  const competitionOptionsByKey = Object.values(competitionOptionsByTeamId).reduce<
    Record<string, WizardCompetitionOption>
  >((carry, competitionOptions) => {
    competitionOptions.forEach((competitionOption) => {
      carry[competitionOption.key] = competitionOption;
    });

    return carry;
  }, {});
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
      (
        competitionOption,
      ): competitionOption is WizardCompetitionOption =>
        competitionOption != null &&
        !resolveIsIndividualSportName(competitionOption.sport_name),
    );

  const nextCompetitionConfigByKey = activeCompetitionKeys.reduce<Record<string, ChampionshipBracketCompetitionConfigDraft>>(
    (carry, competitionKey) => {
      const participantCount = teamIdsByCompetitionKey[competitionKey]?.length ?? 2;
      const competitionOption = competitionOptionsByKey[competitionKey] ?? null;
      carry[competitionKey] =
        draftFormValues.competition_config_by_key[competitionKey] ??
        resolveDefaultCompetitionConfig(participantCount, competitionOption);
      return carry;
    },
    {},
  );

  const nextGroupAssignmentsByCompetitionKey = activeCompetitionKeys.reduce<Record<string, Record<string, number>>>(
    (carry, competitionKey) => {
      const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
      const groupsCount = nextCompetitionConfigByKey[competitionKey]?.groups_count ?? 1;
      carry[competitionKey] = sanitizeGroupAssignments({
        participant_team_ids: participantTeamIds,
        group_assignments: draftFormValues.group_assignments_by_competition_key[competitionKey] ?? {},
        groups_count: groupsCount,
      });
      return carry;
    },
    {},
  );

  const nextGroupOrderByCompetitionKey = activeCompetitionKeys.reduce<
    Record<string, Record<string, string[]>>
  >((carry, competitionKey) => {
    const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
    const groupsCount = nextCompetitionConfigByKey[competitionKey]?.groups_count ?? 1;
    const nextGroupOrder = sanitizeGroupOrderedTeamIdsByGroupNumber({
      participant_team_ids: participantTeamIds,
      group_assignments: nextGroupAssignmentsByCompetitionKey[competitionKey] ?? {},
      groups_count: groupsCount,
      ordered_team_ids_by_group_number: draftFormValues.group_order_by_competition_key[competitionKey] ?? {},
    });

    if (Object.keys(nextGroupOrder).length > 0) {
      carry[competitionKey] = nextGroupOrder;
    }

    return carry;
  }, {});
  const scheduleDayDates = [
    ...new Set(draftFormValues.schedule_days.map((scheduleDay) => scheduleDay.date).filter(Boolean)),
  ];
  const nextSchedulePeriods = sanitizeSchedulePeriodsForDates(
    scheduleDayDates,
    draftFormValues.schedule_periods ?? [],
  );
  const teamCompetitionKeysByTeamId = Object.entries(nextSelectedCompetitionKeysByTeamId).reduce<
    Record<string, string[]>
  >((carry, [teamId, competitionKeys]) => {
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
    selected_team_ids: nextSelectedTeamIds,
    selected_sport_ids_by_team_id: nextSelectedSportIdsByTeamId,
    selected_competition_keys_by_team_id: nextSelectedCompetitionKeysByTeamId,
    competition_config_by_key: nextCompetitionConfigByKey,
    group_assignments_by_competition_key: nextGroupAssignmentsByCompetitionKey,
    group_order_by_competition_key: nextGroupOrderByCompetitionKey,
    schedule_periods: nextSchedulePeriods,
    competition_period_availability: sanitizeCompetitionPeriodAvailabilityValues({
      schedulePeriods: nextSchedulePeriods,
      competitionKeys: activeCompetitionKeys,
      competitionPeriodAvailability:
        draftFormValues.competition_period_availability ?? [],
    }),
    team_competition_availability: sanitizeTeamCompetitionAvailabilityValues({
      schedulePeriods: nextSchedulePeriods,
      teamCompetitionKeysByTeamId,
      teamCompetitionAvailability:
        draftFormValues.team_competition_availability ?? [],
    }),
    individual_event_configs: sanitizeIndividualEventConfigsValues({
      individualSports: selectedIndividualSports,
      individualEventConfigs: draftFormValues.individual_event_configs ?? [],
    }),
    individual_session_configs: sanitizeIndividualSessionConfigsValues({
      schedulePeriods: nextSchedulePeriods,
      individualCompetitionOptions,
      individualSessionConfigs: draftFormValues.individual_session_configs ?? [],
    }),
    resource_locks: sanitizeResourceLocksValues({
      schedulePeriods: nextSchedulePeriods,
      resourceLocks: draftFormValues.resource_locks ?? [],
    }),
    knockout_program_blocks: sanitizeKnockoutProgramBlocksValues({
      schedulePeriods: nextSchedulePeriods,
      seasonSettings,
      collectiveCompetitionOptions,
      knockoutProgramBlocks: draftFormValues.knockout_program_blocks ?? [],
    }),
  };
}
