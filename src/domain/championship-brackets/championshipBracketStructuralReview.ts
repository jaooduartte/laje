import type {
  ChampionshipBracketAvailabilityMode,
  ChampionshipBracketAvailabilityWindowInput,
  ChampionshipBracketCompetitionMatchTargetRecommendationSummary,
  ChampionshipBracketCompetitionDateAvailabilityInput,
  ChampionshipBracketCourtSportMatchTargetPlanningMode,
  ChampionshipBracketExactPreviewCache,
  ChampionshipBracketResourceLockInput,
  ChampionshipBracketReviewConfigurationSummary,
  ChampionshipBracketSetupFormValues,
  ChampionshipBracketSportMatchTargetRecommendationLine,
  ChampionshipBracketSportMatchTargetRecommendationResult,
  ChampionshipBracketSportMatchTargetRecommendationSummary,
  ChampionshipBracketStructuralReviewCourt,
  ChampionshipBracketStructuralReviewDiagnostic,
  ChampionshipBracketStructuralReviewEstimatedMatchEntry,
  ChampionshipBracketStructuralReviewLocation,
  ChampionshipBracketStructuralReviewPendingMatchEntry,
  ChampionshipBracketStructuralReviewPlanningItem,
  ChampionshipBracketStructuralReviewResult,
  ChampionshipBracketStructuralReviewTimelineEntry,
  ChampionshipBracketTeamCompetitionDateAvailabilityInput,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  resolveCanShareIndividualSessionSlot,
  resolveIndividualSessionSharedSlotKey,
} from "@/domain/championship-brackets/championshipBracketIndividualSessionSharing";
import { resolveChampionshipBracketKnockoutProjection } from "@/domain/championship-brackets/championshipBracketKnockoutProjection";
import { MatchNaipe } from "@/lib/enums";
import type { ChampionshipSport, Team } from "@/lib/types";

const DEFAULT_MATCH_DURATION_MINUTES = 30;
const INDIVIDUAL_SPORT_NAMES = new Set(["atletismo", "natacao"]);

type TimeInterval = {
  start: number;
  end: number;
};

type ScheduleDayTimeWindowInput = {
  date: string;
  start_time: string;
  end_time: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
};

function resolveCompetitionKey(input: {
  sport_id: string;
  naipe: ChampionshipBracketSetupFormValues["competitions"][number]["naipe"];
  division: ChampionshipBracketSetupFormValues["competitions"][number]["division"];
}) {
  return [
    input.sport_id,
    input.naipe,
    input.division ?? "WITHOUT_DIVISION",
  ].join("::");
}

function resolveNormalizedSportName(sportName: string): string {
  return sportName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveIsIndividualSportName(sportName: string): boolean {
  return INDIVIDUAL_SPORT_NAMES.has(resolveNormalizedSportName(sportName));
}

function resolveTimeValueToMinutes(timeValue: string | null | undefined) {
  if (!timeValue) {
    return null;
  }

  const [hourValue, minuteValue] = timeValue.split(":").map(Number);

  if (Number.isNaN(hourValue) || Number.isNaN(minuteValue)) {
    return null;
  }

  if (hourValue < 0 || hourValue > 23 || minuteValue < 0 || minuteValue > 59) {
    return null;
  }

  return hourValue * 60 + minuteValue;
}

function resolveMinutesToTimeValue(minutes: number) {
  const safeMinutes = Math.max(0, Math.trunc(minutes));
  const hourValue = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minuteValue = (safeMinutes % 60).toString().padStart(2, "0");
  return `${hourValue}:${minuteValue}`;
}

function resolveDayInterval(
  scheduleDay: ScheduleDayTimeWindowInput,
): TimeInterval | null {
  const dayStartMinutes = resolveTimeValueToMinutes(scheduleDay.start_time);
  const dayEndMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

  if (
    dayStartMinutes == null ||
    dayEndMinutes == null ||
    dayEndMinutes <= dayStartMinutes
  ) {
    return null;
  }

  return {
    start: dayStartMinutes,
    end: dayEndMinutes,
  };
}

function resolveBreakInterval(
  scheduleDay: ScheduleDayTimeWindowInput,
): TimeInterval | null {
  const hasBreakStart = (scheduleDay.break_start_time ?? "").trim() != "";
  const hasBreakEnd = (scheduleDay.break_end_time ?? "").trim() != "";

  if (!hasBreakStart && !hasBreakEnd) {
    return null;
  }

  if (hasBreakStart != hasBreakEnd) {
    return null;
  }

  const dayInterval = resolveDayInterval(scheduleDay);
  const breakStartMinutes = resolveTimeValueToMinutes(
    scheduleDay.break_start_time,
  );
  const breakEndMinutes = resolveTimeValueToMinutes(scheduleDay.break_end_time);

  if (
    !dayInterval ||
    breakStartMinutes == null ||
    breakEndMinutes == null ||
    breakEndMinutes <= breakStartMinutes ||
    breakStartMinutes < dayInterval.start ||
    breakEndMinutes > dayInterval.end
  ) {
    return null;
  }

  return {
    start: breakStartMinutes,
    end: breakEndMinutes,
  };
}

function resolveAvailabilityIntervals({
  scheduleDay,
  mode,
  windows,
}: {
  scheduleDay: ScheduleDayTimeWindowInput;
  mode: ChampionshipBracketAvailabilityMode;
  windows: ChampionshipBracketAvailabilityWindowInput[];
}): TimeInterval[] {
  const dayInterval = resolveDayInterval(scheduleDay);

  if (!dayInterval) {
    return [];
  }

  if (mode == "UNAVAILABLE") {
    return [];
  }

  let intervals: TimeInterval[];

  if (mode == "FULL_DAY") {
    intervals = [dayInterval];
  } else {
    intervals = windows
      .map((window) => {
        const startMinutes = resolveTimeValueToMinutes(window.start_time);
        const endMinutes = resolveTimeValueToMinutes(window.end_time);

        if (
          startMinutes == null ||
          endMinutes == null ||
          endMinutes <= startMinutes ||
          startMinutes < dayInterval.start ||
          endMinutes > dayInterval.end
        ) {
          return null;
        }

        return {
          start: startMinutes,
          end: endMinutes,
        };
      })
      .filter((window): window is TimeInterval => window != null)
      .sort((left, right) => left.start - right.start);
  }

  const breakInterval = resolveBreakInterval(scheduleDay);

  if (!breakInterval) {
    return intervals;
  }

  return intervals.flatMap((interval) => {
    if (
      interval.end <= breakInterval.start ||
      interval.start >= breakInterval.end
    ) {
      return [interval];
    }

    const availableIntervals: TimeInterval[] = [];

    if (interval.start < breakInterval.start) {
      availableIntervals.push({
        start: interval.start,
        end: breakInterval.start,
      });
    }

    if (interval.end > breakInterval.end) {
      availableIntervals.push({
        start: breakInterval.end,
        end: interval.end,
      });
    }

    return availableIntervals;
  });
}

function resolveIntersectedIntervals(
  leftIntervals: TimeInterval[],
  rightIntervals: TimeInterval[],
): TimeInterval[] {
  const intersections: TimeInterval[] = [];

  leftIntervals.forEach((leftInterval) => {
    rightIntervals.forEach((rightInterval) => {
      const start = Math.max(leftInterval.start, rightInterval.start);
      const end = Math.min(leftInterval.end, rightInterval.end);

      if (end > start) {
        intersections.push({ start, end });
      }
    });
  });

  return resolveMergedIntervals(intersections);
}

function resolveMergedIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const sortedIntervals = [...intervals].sort(
    (left, right) => left.start - right.start,
  );
  const mergedIntervals: TimeInterval[] = [];

  sortedIntervals.forEach((interval) => {
    const lastInterval = mergedIntervals[mergedIntervals.length - 1];

    if (!lastInterval || interval.start > lastInterval.end) {
      mergedIntervals.push({ ...interval });
      return;
    }

    lastInterval.end = Math.max(lastInterval.end, interval.end);
  });

  return mergedIntervals;
}

function resolveIntervalsMinutes(intervals: TimeInterval[]) {
  return intervals.reduce(
    (totalMinutes, interval) => totalMinutes + (interval.end - interval.start),
    0,
  );
}

function resolveFreeIntervals({
  dayInterval,
  blockedIntervals,
}: {
  dayInterval: TimeInterval;
  blockedIntervals: TimeInterval[];
}) {
  if (blockedIntervals.length == 0) {
    return [dayInterval];
  }

  const mergedBlockedIntervals = resolveMergedIntervals(blockedIntervals);
  const freeIntervals: TimeInterval[] = [];
  let currentStart = dayInterval.start;

  mergedBlockedIntervals.forEach((blockedInterval) => {
    if (blockedInterval.start > currentStart) {
      freeIntervals.push({
        start: currentStart,
        end: blockedInterval.start,
      });
    }

    currentStart = Math.max(currentStart, blockedInterval.end);
  });

  if (currentStart < dayInterval.end) {
    freeIntervals.push({
      start: currentStart,
      end: dayInterval.end,
    });
  }

  return freeIntervals.filter((interval) => interval.end > interval.start);
}

function resolveCanonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveCanonicalJsonValue(item));
  }

  if (value && typeof value == "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((carry, key) => {
        carry[key] = resolveCanonicalJsonValue(
          (value as Record<string, unknown>)[key],
        );
        return carry;
      }, {});
  }

  return value;
}

export function resolveChampionshipBracketExactPreviewPayloadSignature(
  payload: ChampionshipBracketSetupFormValues,
) {
  return JSON.stringify(resolveCanonicalJsonValue(payload));
}

export function resolveChampionshipBracketExactPreviewCacheValidity({
  cache,
  payloadSignature,
}: {
  cache: ChampionshipBracketExactPreviewCache | null | undefined;
  payloadSignature: string;
}) {
  return cache?.payload_signature == payloadSignature;
}

function resolveSportMetadataBySportId(championshipSports: ChampionshipSport[]) {
  return championshipSports.reduce<
    Record<
      string,
      {
        sport_name: string;
        default_match_duration_minutes: number;
        is_individual: boolean;
      }
    >
  >((carry, championshipSport) => {
    const defaultMatchDurationMinutes =
      typeof championshipSport.default_match_duration_minutes == "number" &&
      championshipSport.default_match_duration_minutes > 0
        ? championshipSport.default_match_duration_minutes
        : DEFAULT_MATCH_DURATION_MINUTES;
    const sportName = championshipSport.sports?.name ?? "Modalidade";

    carry[championshipSport.sport_id] = {
      sport_name: sportName,
      default_match_duration_minutes: defaultMatchDurationMinutes,
      is_individual: resolveIsIndividualSportName(sportName),
    };

    return carry;
  }, {});
}

function buildDefaultCompetitionDateAvailability(
  payload: ChampionshipBracketSetupFormValues,
) {
  return payload.competitions.flatMap((competition) =>
    payload.schedule_days.map((scheduleDay) => ({
      competition_key: resolveCompetitionKey(competition),
      date: scheduleDay.date,
      mode: "FULL_DAY" as const,
      windows: [],
    })),
  );
}

function buildDefaultTeamCompetitionDateAvailability(
  payload: ChampionshipBracketSetupFormValues,
) {
  const teamIdsByCompetitionKey = payload.competitions.reduce<
    Record<string, string[]>
  >((carry, competition) => {
    const competitionKey = resolveCompetitionKey(competition);

    carry[competitionKey] = payload.participants
      .filter((participant) =>
        participant.modalities.some(
          (modality) =>
            modality.sport_id == competition.sport_id &&
            modality.naipe == competition.naipe &&
            modality.division == competition.division,
        ),
      )
      .map((participant) => participant.team_id);

    return carry;
  }, {});

  return Object.entries(teamIdsByCompetitionKey).flatMap(
    ([competitionKey, teamIds]) =>
      teamIds.flatMap((teamId) =>
        payload.schedule_days.map((scheduleDay) => ({
          team_id: teamId,
          competition_key: competitionKey,
          date: scheduleDay.date,
          mode: "FULL_DAY" as const,
          windows: [],
        })),
      ),
  );
}

function resolveCompetitionDateAvailabilityByKey(
  payload: ChampionshipBracketSetupFormValues,
) {
  const availabilityItems =
    payload.competition_date_availability &&
    payload.competition_date_availability.length > 0
      ? payload.competition_date_availability
      : buildDefaultCompetitionDateAvailability(payload);

  return new Map<string, ChampionshipBracketCompetitionDateAvailabilityInput>(
    availabilityItems.map(
      (availabilityItem) =>
        [
          `${availabilityItem.competition_key}::${availabilityItem.date}`,
          availabilityItem,
        ] as const,
    ),
  );
}

function resolveTeamCompetitionDateAvailabilityByKey(
  payload: ChampionshipBracketSetupFormValues,
) {
  const availabilityItems =
    payload.team_competition_date_availability &&
    payload.team_competition_date_availability.length > 0
      ? payload.team_competition_date_availability
      : buildDefaultTeamCompetitionDateAvailability(payload);

  return new Map<string, ChampionshipBracketTeamCompetitionDateAvailabilityInput>(
    availabilityItems.map(
      (availabilityItem) =>
        [
          `${availabilityItem.team_id}::${availabilityItem.competition_key}::${availabilityItem.date}`,
          availabilityItem,
        ] as const,
    ),
  );
}

function resolvePlanningItemStatus({
  accumulatedMinutes,
  freeMinutes,
}: {
  accumulatedMinutes: number;
  freeMinutes: number;
}) {
  return accumulatedMinutes > freeMinutes ? "OVERFLOW" : "WITHIN_CAPACITY";
}

function resolveGroupStageMatchCount(groupSizes: number[]) {
  return groupSizes.reduce((totalMatches, groupSize) => {
    if (groupSize < 2) {
      return totalMatches;
    }

    return totalMatches + (groupSize * (groupSize - 1)) / 2;
  }, 0);
}

function resolveCompetitionGroupSizes({
  competition,
  teamIds,
}: {
  competition: ChampionshipBracketSetupFormValues["competitions"][number];
  teamIds: string[];
}) {
  if (competition.groups.length > 0) {
    return competition.groups
      .map((group) => group.team_ids.length)
      .filter((groupSize) => groupSize > 0);
  }

  const groupSizeByNumber = new Map<number, number>();

  teamIds.forEach((teamId, teamIndex) => {
    const groupNumber = (teamIndex % Math.max(1, competition.groups_count)) + 1;

    groupSizeByNumber.set(
      groupNumber,
      (groupSizeByNumber.get(groupNumber) ?? 0) + 1,
    );
  });

  return [...groupSizeByNumber.values()];
}

type EstimatedMatchDescriptor = Omit<
  ChampionshipBracketStructuralReviewEstimatedMatchEntry,
  "match_number" | "start_time" | "end_time" | "estimated"
> & {
  competition_key: string | null;
};

function resolveEstimatedMatchPhaseRank(
  phase: EstimatedMatchDescriptor["phase"],
): number {
  switch (phase) {
    case "GROUP_STAGE":
      return 0;

    case "ROUND_OF_32":
      return 1;

    case "ROUND_OF_16":
      return 2;

    case "QUARTERFINAL":
      return 3;

    case "SEMIFINAL":
      return 4;

    default:
      return 5;
  }
}

function resolveKnockoutPhaseDescriptors({
  projectedBracketSize,
  durationMinutes,
}: {
  projectedBracketSize: number;
  durationMinutes: number;
}): Pick<
  EstimatedMatchDescriptor,
  "phase" | "phase_label" | "duration_minutes"
>[] {
  const descriptors: Pick<
    EstimatedMatchDescriptor,
    "phase" | "phase_label" | "duration_minutes"
  >[] = [];
  let currentBracketSize = projectedBracketSize;

  while (currentBracketSize > 2) {
    const phaseDescriptor =
      currentBracketSize == 32
        ? { phase: "ROUND_OF_32" as const, phase_label: "32-avos de final" }
        : currentBracketSize == 16
          ? { phase: "ROUND_OF_16" as const, phase_label: "Oitavas de final" }
          : currentBracketSize == 8
            ? {
                phase: "QUARTERFINAL" as const,
                phase_label: "Quartas de final",
              }
            : currentBracketSize == 4
              ? { phase: "SEMIFINAL" as const, phase_label: "Semifinal" }
              : { phase: null, phase_label: "Mata-mata" };
    const matchCount = Math.max(1, Math.floor(currentBracketSize / 2));

    descriptors.push(
      ...Array.from({ length: matchCount }, () => ({
        ...phaseDescriptor,
        duration_minutes: durationMinutes,
      })),
    );

    currentBracketSize = Math.floor(currentBracketSize / 2);
  }

  return descriptors;
}

function resolveCompetitionEstimatedMatchDescriptors({
  competition,
  sportName,
  durationMinutes,
  teamIds,
}: {
  competition: ChampionshipBracketSetupFormValues["competitions"][number];
  sportName: string;
  durationMinutes: number;
  teamIds: string[];
}): EstimatedMatchDescriptor[] {
  const competitionKey = resolveCompetitionKey(competition);
  const groupStageMatchCount = resolveGroupStageMatchCount(
    resolveCompetitionGroupSizes({
      competition,
      teamIds,
    }),
  );
  const knockoutProjection = resolveChampionshipBracketKnockoutProjection({
    groups_count: competition.groups_count,
    qualifiers_per_group: competition.qualifiers_per_group,
    should_complete_knockout_with_best_second_placed_teams:
      competition.should_complete_knockout_with_best_second_placed_teams,
  });

  return [
    ...Array.from({ length: groupStageMatchCount }, () => ({
      competition_key: competitionKey,
      sport_id: competition.sport_id,
      sport_name: sportName,
      naipe: competition.naipe,
      division: competition.division,
      phase: "GROUP_STAGE" as const,
      phase_label: "Fase de grupos",
      duration_minutes: durationMinutes,
    })),
    ...resolveKnockoutPhaseDescriptors({
      projectedBracketSize: knockoutProjection.projected_bracket_size,
      durationMinutes,
    }).map((phaseDescriptor) => ({
      competition_key: competitionKey,
      sport_id: competition.sport_id,
      sport_name: sportName,
      naipe: competition.naipe,
      division: competition.division,
      ...phaseDescriptor,
    })),
  ];
}

function resolveCompetitionPreferenceScore({
  competition,
  preferredNaipe,
  preferredDivision,
}: {
  competition: ChampionshipBracketSetupFormValues["competitions"][number];
  preferredNaipe: ChampionshipBracketSetupFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_preference"]["preferred_naipe"] | null;
  preferredDivision: ChampionshipBracketSetupFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_preference"]["preferred_division"] | null;
}) {
  let score = 0;

  if (preferredNaipe && competition.naipe == preferredNaipe) {
    score += 100;
  }

  if (preferredDivision && competition.division == preferredDivision) {
    score += 10;
  }

  return score;
}

function resolveRemainingCapacityMetrics({
  freeMinutes,
  accumulatedMinutes,
  matchDurationMinutes,
}: {
  freeMinutes: number;
  accumulatedMinutes: number;
  matchDurationMinutes: number;
}) {
  const remainingMinutes = Math.max(0, freeMinutes - accumulatedMinutes);
  const additionalMatchCapacity =
    matchDurationMinutes > 0
      ? Math.floor(remainingMinutes / matchDurationMinutes)
      : 0;

  return {
    remainingMinutes,
    additionalMatchCapacity,
  };
}

function resolveOrderedEstimatedMatchDescriptorQueue({
  target,
  courtPreference,
  competitions,
  sportName,
  durationMinutes,
  collectiveTeamIdsByCompetitionKey,
  scheduleDay,
  competitionDateAvailabilityByKey,
  consumedEstimatedDescriptorCountByCompetitionKey,
  requestedMatchCount,
}: {
  target: ChampionshipBracketSetupFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_match_targets"][number];
  courtPreference: ChampionshipBracketSetupFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_preference"] | null | undefined;
  competitions: ChampionshipBracketSetupFormValues["competitions"];
  sportName: string;
  durationMinutes: number;
  collectiveTeamIdsByCompetitionKey: Record<string, string[]>;
  scheduleDay:
    | ChampionshipBracketSetupFormValues["schedule_days"][number]
    | ChampionshipBracketWizardDraftFormValues["schedule_days"][number];
  competitionDateAvailabilityByKey: Map<
    string,
    ChampionshipBracketCompetitionDateAvailabilityInput
  >;
  consumedEstimatedDescriptorCountByCompetitionKey: Map<string, number>;
  requestedMatchCount: number;
}): EstimatedMatchDescriptor[] {
  const preferredNaipe = courtPreference?.preferred_naipe ?? null;
  const preferredDivision = courtPreference?.preferred_division ?? null;
  const sequenceMode = courtPreference?.sequence_mode ?? "FLEXIBLE";
  const shouldAlternateNaipeAfterExclusiveKnockoutPhase =
    sequenceMode == "GROUP_NAIPE" &&
    courtPreference?.alternate_naipe_after_exclusive_knockout_phase === true;
  const competitionQueues = competitions
    .filter((competition) => competition.sport_id == target.sport_id)
    .map((competition) => {
      const competitionKey = resolveCompetitionKey(competition);
      const competitionAvailability =
        competitionDateAvailabilityByKey.get(
          `${competitionKey}::${scheduleDay.date}`,
        ) ??
        ({
          competition_key: competitionKey,
          date: scheduleDay.date,
          mode: "FULL_DAY",
          windows: [],
        } satisfies ChampionshipBracketCompetitionDateAvailabilityInput);
      const competitionIntervals = resolveAvailabilityIntervals({
        scheduleDay,
        mode: competitionAvailability.mode,
        windows: competitionAvailability.windows,
      });

      if (competitionIntervals.length == 0) {
        return null;
      }

      const consumedDescriptors =
        consumedEstimatedDescriptorCountByCompetitionKey.get(competitionKey) ?? 0;
      const remainingDescriptors = resolveCompetitionEstimatedMatchDescriptors({
        competition,
        sportName,
        durationMinutes,
        teamIds: collectiveTeamIdsByCompetitionKey[competitionKey] ?? [],
      }).slice(consumedDescriptors);

      if (remainingDescriptors.length == 0) {
        return null;
      }

      return {
        competition,
        score: resolveCompetitionPreferenceScore({
          competition,
          preferredNaipe,
          preferredDivision,
        }),
        descriptors: remainingDescriptors,
      };
    })
    .filter(
      (
        competitionQueue,
      ): competitionQueue is {
        competition: ChampionshipBracketSetupFormValues["competitions"][number];
        score: number;
        descriptors: EstimatedMatchDescriptor[];
      } => competitionQueue != null,
    )
    .sort((left, right) => right.score - left.score);

  if (competitionQueues.length == 0) {
    return [];
  }

  const orderedQueues =
    sequenceMode == "GROUP_NAIPE"
      ? [...competitionQueues].sort((left, right) => {
          if (left.competition.naipe == right.competition.naipe) {
            return right.score - left.score;
          }

          if (preferredNaipe) {
            if (left.competition.naipe == preferredNaipe) {
              return -1;
            }

            if (right.competition.naipe == preferredNaipe) {
              return 1;
            }
          }

          return left.competition.naipe.localeCompare(right.competition.naipe);
        })
      : sequenceMode == "GROUP_DIVISION"
        ? [...competitionQueues].sort((left, right) => {
            if (left.competition.division == right.competition.division) {
              return right.score - left.score;
            }

            if (preferredDivision) {
              if (left.competition.division == preferredDivision) {
                return -1;
              }

              if (right.competition.division == preferredDivision) {
                return 1;
              }
            }

            return `${left.competition.division ?? ""}`.localeCompare(
              `${right.competition.division ?? ""}`,
            );
          })
        : competitionQueues;

  if (sequenceMode == "GROUP_NAIPE") {
    const prioritizedNaipe =
      preferredNaipe ?? orderedQueues[0]?.competition.naipe ?? null;
    const phaseDescriptorsByRank = new Map<
      number,
      EstimatedMatchDescriptor[]
    >();

    orderedQueues.forEach((queue) => {
      queue.descriptors.forEach((descriptor) => {
        const phaseRank = resolveEstimatedMatchPhaseRank(descriptor.phase);
        const phaseDescriptors = phaseDescriptorsByRank.get(phaseRank) ?? [];

        phaseDescriptors.push(descriptor);
        phaseDescriptorsByRank.set(phaseRank, phaseDescriptors);
      });
    });

    let remainingRequestedMatchCount = requestedMatchCount;
    const groupedDescriptors: EstimatedMatchDescriptor[] = [];
    let exclusiveKnockoutNaipe: MatchNaipe | null = null;

    if (shouldAlternateNaipeAfterExclusiveKnockoutPhase) {
      const historicalPhaseDescriptorsByRank = new Map<
        number,
        {
          totalCount: number;
          consumedCount: number;
          naipes: Set<MatchNaipe>;
        }
      >();

      competitions
        .filter((competition) => competition.sport_id == target.sport_id)
        .forEach((competition) => {
          const competitionKey = resolveCompetitionKey(competition);
          const allDescriptors = resolveCompetitionEstimatedMatchDescriptors({
            competition,
            sportName,
            durationMinutes,
            teamIds: collectiveTeamIdsByCompetitionKey[competitionKey] ?? [],
          });
          const consumedDescriptorCount = Math.min(
            consumedEstimatedDescriptorCountByCompetitionKey.get(competitionKey) ?? 0,
            allDescriptors.length,
          );

          allDescriptors.forEach((descriptor, descriptorIndex) => {
            const phaseRank = resolveEstimatedMatchPhaseRank(descriptor.phase);

            if (phaseRank <= 0) {
              return;
            }

            const phaseSummary =
              historicalPhaseDescriptorsByRank.get(phaseRank) ?? {
                totalCount: 0,
                consumedCount: 0,
                naipes: new Set<MatchNaipe>(),
              };

            phaseSummary.totalCount += 1;
            phaseSummary.consumedCount +=
              descriptorIndex < consumedDescriptorCount ? 1 : 0;
            phaseSummary.naipes.add(descriptor.naipe);
            historicalPhaseDescriptorsByRank.set(phaseRank, phaseSummary);
          });
        });

      [...historicalPhaseDescriptorsByRank.entries()]
        .sort(([leftRank], [rightRank]) => leftRank - rightRank)
        .forEach(([, phaseSummary]) => {
          if (
            phaseSummary.totalCount == phaseSummary.consumedCount &&
            phaseSummary.naipes.size == 1
          ) {
            exclusiveKnockoutNaipe =
              [...phaseSummary.naipes][0] ?? exclusiveKnockoutNaipe;
          }
        });
    }
    let knockoutPriorityNaipe: MatchNaipe | null = null;

    [...phaseDescriptorsByRank.entries()]
      .sort(([leftRank], [rightRank]) => leftRank - rightRank)
      .forEach(([phaseRank, phaseDescriptors]) => {
        if (remainingRequestedMatchCount <= 0) {
          return;
        }

        const phaseNaipes = [
          ...new Set(phaseDescriptors.map((descriptor) => descriptor.naipe)),
        ];
        const isKnockoutPhase = phaseRank > 0;

        if (
          shouldAlternateNaipeAfterExclusiveKnockoutPhase &&
          isKnockoutPhase &&
          phaseNaipes.length == 1
        ) {
          exclusiveKnockoutNaipe = phaseNaipes[0] ?? null;
        }

        if (
          shouldAlternateNaipeAfterExclusiveKnockoutPhase &&
          isKnockoutPhase &&
          phaseNaipes.length == 2 &&
          exclusiveKnockoutNaipe != null
        ) {
          knockoutPriorityNaipe =
            phaseNaipes.find((naipe) => naipe != exclusiveKnockoutNaipe) ??
            null;
        }

        const phasePriorityNaipe =
          isKnockoutPhase && knockoutPriorityNaipe != null
            ? knockoutPriorityNaipe
            : prioritizedNaipe;
        const prioritizedDescriptors = phaseDescriptors.filter(
          (descriptor) => descriptor.naipe == phasePriorityNaipe,
        );
        const fallbackDescriptors = phaseDescriptors.filter(
          (descriptor) => descriptor.naipe != phasePriorityNaipe,
        );
        const availableMatchCount =
          prioritizedDescriptors.length + fallbackDescriptors.length;
        const phaseMatchCount = Math.min(
          remainingRequestedMatchCount,
          availableMatchCount,
        );

        if (phaseMatchCount <= 0) {
          return;
        }

        if (
          prioritizedDescriptors.length == 0 ||
          fallbackDescriptors.length == 0
        ) {
          groupedDescriptors.push(
            ...[...prioritizedDescriptors, ...fallbackDescriptors].slice(
              0,
              phaseMatchCount,
            ),
          );
          remainingRequestedMatchCount -= phaseMatchCount;
          return;
        }

        let prioritizedMatchCount = Math.min(
          prioritizedDescriptors.length,
          Math.ceil(phaseMatchCount / 2),
        );
        let fallbackMatchCount = Math.min(
          fallbackDescriptors.length,
          phaseMatchCount - prioritizedMatchCount,
        );
        let remainingPhaseMatchCount =
          phaseMatchCount - prioritizedMatchCount - fallbackMatchCount;

        if (remainingPhaseMatchCount > 0) {
          const additionalFallbackMatchCount = Math.min(
            fallbackDescriptors.length - fallbackMatchCount,
            remainingPhaseMatchCount,
          );

          fallbackMatchCount += additionalFallbackMatchCount;
          remainingPhaseMatchCount -= additionalFallbackMatchCount;
        }

        if (remainingPhaseMatchCount > 0) {
          const additionalPrioritizedMatchCount = Math.min(
            prioritizedDescriptors.length - prioritizedMatchCount,
            remainingPhaseMatchCount,
          );

          prioritizedMatchCount += additionalPrioritizedMatchCount;
        }

        groupedDescriptors.push(
          ...prioritizedDescriptors.slice(0, prioritizedMatchCount),
          ...fallbackDescriptors.slice(0, fallbackMatchCount),
        );
        remainingRequestedMatchCount -= phaseMatchCount;
      });

    return groupedDescriptors;
  }

  const queuedDescriptors =
    sequenceMode == "FLEXIBLE"
      ? (() => {
          const clonedQueues = orderedQueues.map((queue) => ({
            ...queue,
            descriptors: [...queue.descriptors],
          }));
          const descriptors: EstimatedMatchDescriptor[] = [];

          while (clonedQueues.some((queue) => queue.descriptors.length > 0)) {
            clonedQueues.forEach((queue) => {
              const nextDescriptor = queue.descriptors.shift();

              if (nextDescriptor) {
                descriptors.push(nextDescriptor);
              }
            });
          }

          return descriptors;
        })()
      : orderedQueues.flatMap((queue) => queue.descriptors);

  return queuedDescriptors
    .map((descriptor, index) => ({
      descriptor,
      index,
    }))
    .sort((left, right) => {
      const leftPhaseRank = resolveEstimatedMatchPhaseRank(
        left.descriptor.phase,
      );
      const rightPhaseRank = resolveEstimatedMatchPhaseRank(
        right.descriptor.phase,
      );

      if (leftPhaseRank != rightPhaseRank) {
        return leftPhaseRank - rightPhaseRank;
      }

      return left.index - right.index;
    })
    .map(({ descriptor }) => descriptor);
}

function resolveCourtBlockedIntervals({
  scheduleDay,
  locationKey,
  courtKey,
  breakInterval,
  resourceLocks,
  individualSessionConfigs,
  knockoutProgramBlocks,
  derivedSessionLockKeySet,
}: {
  scheduleDay:
    | ChampionshipBracketSetupFormValues["schedule_days"][number]
    | ChampionshipBracketWizardDraftFormValues["schedule_days"][number];
  locationKey: string;
  courtKey: string;
  breakInterval: TimeInterval | null;
  resourceLocks: ChampionshipBracketSetupFormValues["resource_locks"];
  individualSessionConfigs: ChampionshipBracketSetupFormValues["individual_session_configs"];
  knockoutProgramBlocks: ChampionshipBracketSetupFormValues["knockout_program_blocks"];
  derivedSessionLockKeySet: Set<string>;
}) {
  const blockedIntervals: TimeInterval[] = [];

  if (breakInterval) {
    blockedIntervals.push(breakInterval);
  }

  resourceLocks
    .filter(
      (resourceLock) =>
        resourceLock.date == scheduleDay.date &&
        resourceLock.location_key == locationKey &&
        resourceLock.court_key == courtKey &&
        !derivedSessionLockKeySet.has(
          resolveIndividualSessionSharedSlotKey({
            sport_id: resourceLock.sport_id,
            division: resourceLock.division,
            date: resourceLock.date,
            start_time: resourceLock.start_time,
            end_time: resourceLock.end_time,
            location_key: resourceLock.location_key,
            court_key: resourceLock.court_key,
          }),
        ),
    )
    .forEach((resourceLock) => {
      const startMinutes = resolveTimeValueToMinutes(resourceLock.start_time);
      const endMinutes = resolveTimeValueToMinutes(resourceLock.end_time);

      if (
        startMinutes == null ||
        endMinutes == null ||
        endMinutes <= startMinutes
      ) {
        return;
      }

      blockedIntervals.push({
        start: startMinutes,
        end: endMinutes,
      });
    });

  individualSessionConfigs
    .filter(
      (sessionConfig) =>
        sessionConfig.scheduled_date == scheduleDay.date &&
        sessionConfig.location_key == locationKey &&
        sessionConfig.court_key == courtKey &&
        sessionConfig.start_time != null &&
        sessionConfig.end_time != null,
    )
    .forEach((sessionConfig) => {
      const startMinutes = resolveTimeValueToMinutes(sessionConfig.start_time);
      const endMinutes = resolveTimeValueToMinutes(sessionConfig.end_time);

      if (
        startMinutes == null ||
        endMinutes == null ||
        endMinutes <= startMinutes
      ) {
        return;
      }

      blockedIntervals.push({
        start: startMinutes,
        end: endMinutes,
      });
    });

  knockoutProgramBlocks
    .filter(
      (programBlock) =>
        programBlock.date == scheduleDay.date &&
        programBlock.location_key == locationKey &&
        programBlock.court_key == courtKey &&
        programBlock.start_time &&
        programBlock.end_time,
    )
    .forEach((programBlock) => {
      const startMinutes = resolveTimeValueToMinutes(programBlock.start_time);
      const endMinutes = resolveTimeValueToMinutes(programBlock.end_time);

      if (
        startMinutes == null ||
        endMinutes == null ||
        endMinutes <= startMinutes
      ) {
        return;
      }

      blockedIntervals.push({
        start: startMinutes,
        end: endMinutes,
      });
    });

  return resolveMergedIntervals(blockedIntervals);
}

export function resolveChampionshipBracketSportMatchTargetRecommendations({
  scheduleDays,
  competitions,
  participants,
  competitionDateAvailability,
  individualSessionConfigs,
  resourceLocks,
  knockoutProgramBlocks,
  championshipSports,
}: {
  scheduleDays: ChampionshipBracketWizardDraftFormValues["schedule_days"];
  competitions: ChampionshipBracketSetupFormValues["competitions"];
  participants: ChampionshipBracketSetupFormValues["participants"];
  competitionDateAvailability: NonNullable<
    ChampionshipBracketWizardDraftFormValues["competition_date_availability"]
  >;
  individualSessionConfigs: ChampionshipBracketSetupFormValues["individual_session_configs"];
  resourceLocks: ChampionshipBracketSetupFormValues["resource_locks"];
  knockoutProgramBlocks: ChampionshipBracketSetupFormValues["knockout_program_blocks"];
  championshipSports: ChampionshipSport[];
}): ChampionshipBracketSportMatchTargetRecommendationResult {
  const sportMetadataBySportId =
    resolveSportMetadataBySportId(championshipSports);
  const collectiveCompetitions = competitions.filter((competition) => {
    return !sportMetadataBySportId[competition.sport_id]?.is_individual;
  });
  const collectiveCompetitionKeysBySportId = collectiveCompetitions.reduce<
    Record<string, string[]>
  >((carry, competition) => {
    if (!carry[competition.sport_id]) {
      carry[competition.sport_id] = [];
    }

    carry[competition.sport_id].push(resolveCompetitionKey(competition));
    return carry;
  }, {});
  const collectiveTeamIdsByCompetitionKey = collectiveCompetitions.reduce<
    Record<string, string[]>
  >((carry, competition) => {
    const competitionKey = resolveCompetitionKey(competition);

    carry[competitionKey] = participants
      .filter((participant) =>
        participant.modalities.some(
          (modality) =>
            modality.sport_id == competition.sport_id &&
            modality.naipe == competition.naipe &&
            modality.division == competition.division,
        ),
      )
      .map((participant) => participant.team_id);

    return carry;
  }, {});
  const competitionDateAvailabilityByKey = new Map(
    competitionDateAvailability.map((availabilityItem) => [
      `${availabilityItem.competition_key}::${availabilityItem.date}`,
      availabilityItem,
    ]),
  );
  const derivedSessionLockKeySet = new Set(
    individualSessionConfigs
      .filter(
        (sessionConfig) =>
          sessionConfig.exclusive_lock_enabled == true &&
          sessionConfig.scheduled_date &&
          sessionConfig.start_time &&
          sessionConfig.end_time &&
          sessionConfig.location_key &&
          sessionConfig.court_key,
      )
      .map((sessionConfig) =>
        resolveIndividualSessionSharedSlotKey({
          sport_id: sessionConfig.sport_id,
          division: sessionConfig.division,
          scheduled_date: sessionConfig.scheduled_date,
          start_time: sessionConfig.start_time,
          end_time: sessionConfig.end_time,
          location_key: sessionConfig.location_key,
          court_key: sessionConfig.court_key,
        }),
      ),
  );
  const requiredMatchCountBySportId = collectiveCompetitions.reduce<
    Record<string, number>
  >((carry, competition) => {
    const sportMetadata = sportMetadataBySportId[competition.sport_id];
    const descriptors = resolveCompetitionEstimatedMatchDescriptors({
      competition,
      sportName: sportMetadata?.sport_name ?? "Modalidade",
      durationMinutes:
        sportMetadata?.default_match_duration_minutes ??
        DEFAULT_MATCH_DURATION_MINUTES,
      teamIds:
        collectiveTeamIdsByCompetitionKey[resolveCompetitionKey(competition)] ??
        [],
    }).filter((descriptor) => descriptor.phase != "FINAL");

    carry[competition.sport_id] =
      (carry[competition.sport_id] ?? 0) + descriptors.length;

    return carry;
  }, {});
  const requiredMatchCountByCompetitionKey = collectiveCompetitions.reduce<
    Record<string, number>
  >((carry, competition) => {
    const competitionKey = resolveCompetitionKey(competition);
    const sportMetadata = sportMetadataBySportId[competition.sport_id];
    const descriptors = resolveCompetitionEstimatedMatchDescriptors({
      competition,
      sportName: sportMetadata?.sport_name ?? "Modalidade",
      durationMinutes:
        sportMetadata?.default_match_duration_minutes ??
        DEFAULT_MATCH_DURATION_MINUTES,
      teamIds: collectiveTeamIdsByCompetitionKey[competitionKey] ?? [],
    }).filter((descriptor) => descriptor.phase != "FINAL");

    carry[competitionKey] = descriptors.length;
    return carry;
  }, {});
  const manualMatchCountBySportId = scheduleDays.reduce<Record<string, number>>(
    (carry, scheduleDay) => {
      scheduleDay.locations.forEach((location) => {
        location.courts.forEach((court) => {
          court.sport_match_targets.forEach((target) => {
            if ((target.planning_mode ?? "MANUAL") == "AUTO") {
              return;
            }

            carry[target.sport_id] =
              (carry[target.sport_id] ?? 0) +
              Math.max(0, target.planned_match_count);
          });
        });
      });

      return carry;
    },
    {},
  );
  const remainingAutoMatchCountBySportId = Object.entries(
    requiredMatchCountBySportId,
  ).reduce<Record<string, number>>((carry, [sportId, requiredMatchCount]) => {
    carry[sportId] = Math.max(
      0,
      requiredMatchCount - (manualMatchCountBySportId[sportId] ?? 0),
    );
    return carry;
  }, {});
  const lineRecommendations: ChampionshipBracketSportMatchTargetRecommendationLine[] =
    [];
  const lineRecommendationContextByKey = new Map<
    string,
    {
      target: ChampionshipBracketWizardDraftFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_match_targets"][number];
      courtPreference:
        | ChampionshipBracketWizardDraftFormValues["schedule_days"][number]["locations"][number]["courts"][number]["sport_preference"]
        | null
        | undefined;
      sportName: string;
      durationMinutes: number;
      scheduleDay: ChampionshipBracketWizardDraftFormValues["schedule_days"][number];
    }
  >();

  scheduleDays.forEach((scheduleDay) => {
    const dayInterval = resolveDayInterval(scheduleDay);
    const breakInterval = resolveBreakInterval(scheduleDay);

    scheduleDay.locations.forEach((location) => {
      location.courts.forEach((court) => {
        const blockedIntervals = resolveCourtBlockedIntervals({
          scheduleDay,
          locationKey: location.id,
          courtKey: court.id,
          breakInterval,
          resourceLocks,
          individualSessionConfigs,
          knockoutProgramBlocks,
          derivedSessionLockKeySet,
        });
        const freeCourtIntervals =
          dayInterval != null
            ? resolveFreeIntervals({
                dayInterval,
                blockedIntervals,
              })
            : [];
        const freeCourtMinutes = resolveIntervalsMinutes(freeCourtIntervals);
        let reservedMinutes = 0;

        const orderedTargets = [...court.sport_match_targets].sort(
          (left, right) =>
            (sportMetadataBySportId[left.sport_id]?.sport_name ?? "").localeCompare(
              sportMetadataBySportId[right.sport_id]?.sport_name ?? "",
              "pt-BR",
              { sensitivity: "base" },
            ),
        );

        orderedTargets.forEach((target) => {
          const planningMode =
            (target.planning_mode ?? "MANUAL") satisfies ChampionshipBracketCourtSportMatchTargetPlanningMode;
          const sportMetadata = sportMetadataBySportId[target.sport_id];
          const durationMinutes =
            sportMetadata?.default_match_duration_minutes ??
            DEFAULT_MATCH_DURATION_MINUTES;
          const sportCompetitionKeys =
            collectiveCompetitionKeysBySportId[target.sport_id] ?? [];
          const hasPlayableWindow = sportCompetitionKeys.some((competitionKey) => {
            const competitionAvailability =
              competitionDateAvailabilityByKey.get(
                `${competitionKey}::${scheduleDay.date}`,
              ) ??
              ({
                competition_key: competitionKey,
                date: scheduleDay.date,
                mode: "FULL_DAY",
                windows: [],
              } satisfies ChampionshipBracketCompetitionDateAvailabilityInput);

            return (
              resolveAvailabilityIntervals({
                scheduleDay,
                mode: competitionAvailability.mode,
                windows: competitionAvailability.windows,
              }).length > 0
            );
          });
          const manualMatchCount = Math.max(0, target.planned_match_count);
          const additionalMatchCapacity =
            durationMinutes > 0
              ? Math.floor(
                  Math.max(0, freeCourtMinutes - reservedMinutes) /
                    durationMinutes,
                )
              : 0;
          const recommendedMatchCount =
            planningMode == "AUTO" && hasPlayableWindow
              ? Math.min(
                  remainingAutoMatchCountBySportId[target.sport_id] ?? 0,
                  additionalMatchCapacity,
                )
              : 0;
          const effectiveMatchCount =
            planningMode == "AUTO" ? recommendedMatchCount : manualMatchCount;

          if (planningMode == "AUTO") {
            remainingAutoMatchCountBySportId[target.sport_id] = Math.max(
              0,
              (remainingAutoMatchCountBySportId[target.sport_id] ?? 0) -
                recommendedMatchCount,
            );
          }

          reservedMinutes += effectiveMatchCount * durationMinutes;
          const recommendationKey = [
            scheduleDay.id,
            location.id,
            court.id,
            target.sport_id,
          ].join("::");

          lineRecommendations.push({
            key: recommendationKey,
            schedule_day_id: scheduleDay.id,
            schedule_day_date: scheduleDay.date,
            location_id: location.id,
            court_id: court.id,
            sport_id: target.sport_id,
            planning_mode: planningMode,
            manual_match_count: manualMatchCount,
            recommended_match_count: recommendedMatchCount,
            effective_match_count: effectiveMatchCount,
            free_minutes: freeCourtMinutes,
            reserved_minutes_before_line:
              reservedMinutes - effectiveMatchCount * durationMinutes,
            remaining_minutes_after_line: Math.max(
              0,
              freeCourtMinutes - reservedMinutes,
            ),
            additional_match_capacity:
              durationMinutes > 0
                ? Math.floor(
                    Math.max(0, freeCourtMinutes - reservedMinutes) /
                      durationMinutes,
                  )
                : 0,
            has_playable_window: hasPlayableWindow,
            required_match_count: 0,
            resolved_match_count: 0,
            shortage_match_count: 0,
            excess_match_count: 0,
            competition_breakdowns: [],
          });
          lineRecommendationContextByKey.set(recommendationKey, {
            target,
            courtPreference: court.sport_preference,
            sportName: sportMetadata?.sport_name ?? "Modalidade",
            durationMinutes,
            scheduleDay,
          });
        });
      });
    });
  });

  const resolvedMatchCountByCompetitionKey: Record<string, number> = {};
  const consumedEstimatedDescriptorCountByCompetitionKey = new Map<
    string,
    number
  >();

  lineRecommendations.forEach((recommendationLine) => {
    const recommendationContext =
      lineRecommendationContextByKey.get(recommendationLine.key);

    if (
      !recommendationContext ||
      recommendationLine.effective_match_count <= 0
    ) {
      return;
    }

    const competitionBreakdownByKey = new Map<
      string,
      {
        competition_key: string;
        naipe: MatchNaipe;
        division: ChampionshipBracketCompetitionMatchTargetRecommendationSummary["division"];
        planned_match_count: number;
      }
    >();

    resolveOrderedEstimatedMatchDescriptorQueue({
      target: recommendationContext.target,
      courtPreference: recommendationContext.courtPreference,
      competitions,
      sportName: recommendationContext.sportName,
      durationMinutes: recommendationContext.durationMinutes,
      collectiveTeamIdsByCompetitionKey,
      scheduleDay: recommendationContext.scheduleDay,
      competitionDateAvailabilityByKey,
      consumedEstimatedDescriptorCountByCompetitionKey,
      requestedMatchCount: recommendationLine.effective_match_count,
    })
      .slice(0, recommendationLine.effective_match_count)
      .forEach((descriptor) => {
        if (!descriptor.competition_key) {
          return;
        }

        const existingBreakdown = competitionBreakdownByKey.get(
          descriptor.competition_key,
        );

        competitionBreakdownByKey.set(descriptor.competition_key, {
          competition_key: descriptor.competition_key,
          naipe: descriptor.naipe,
          division: descriptor.division,
          planned_match_count:
            (existingBreakdown?.planned_match_count ?? 0) + 1,
        });
        resolvedMatchCountByCompetitionKey[descriptor.competition_key] =
          (resolvedMatchCountByCompetitionKey[descriptor.competition_key] ?? 0) +
          1;
        consumedEstimatedDescriptorCountByCompetitionKey.set(
          descriptor.competition_key,
          (consumedEstimatedDescriptorCountByCompetitionKey.get(
            descriptor.competition_key,
          ) ?? 0) + 1,
        );
      });

    recommendationLine.competition_breakdowns = [
      ...competitionBreakdownByKey.values(),
    ];
  });

  const resolvedMatchCountBySportId = lineRecommendations.reduce<
    Record<string, number>
  >((carry, recommendationLine) => {
    const distributedMatchCount = recommendationLine.competition_breakdowns.reduce(
      (totalMatchCount, competitionBreakdown) =>
        totalMatchCount + competitionBreakdown.planned_match_count,
      0,
    );

    carry[recommendationLine.sport_id] =
      (carry[recommendationLine.sport_id] ?? 0) + distributedMatchCount;
    return carry;
  }, {});
  const sportSummaryBySportId = Object.keys(requiredMatchCountBySportId).reduce<
    Record<string, ChampionshipBracketSportMatchTargetRecommendationSummary>
  >((carry, sportId) => {
    const requiredMatchCount = requiredMatchCountBySportId[sportId] ?? 0;
    const resolvedMatchCount = resolvedMatchCountBySportId[sportId] ?? 0;

    carry[sportId] = {
      sport_id: sportId,
      sport_name: sportMetadataBySportId[sportId]?.sport_name ?? "Modalidade",
      required_match_count: requiredMatchCount,
      resolved_match_count: resolvedMatchCount,
      shortage_match_count: Math.max(0, requiredMatchCount - resolvedMatchCount),
      excess_match_count: Math.max(0, resolvedMatchCount - requiredMatchCount),
    };

    return carry;
  }, {});
  const competitionSummaries =
    collectiveCompetitions.map<ChampionshipBracketCompetitionMatchTargetRecommendationSummary>(
      (competition) => {
        const competitionKey = resolveCompetitionKey(competition);
        const requiredMatchCount =
          requiredMatchCountByCompetitionKey[competitionKey] ?? 0;
        const resolvedMatchCount =
          resolvedMatchCountByCompetitionKey[competitionKey] ?? 0;

        return {
          competition_key: competitionKey,
          sport_id: competition.sport_id,
          sport_name:
            sportMetadataBySportId[competition.sport_id]?.sport_name ??
            "Modalidade",
          naipe: competition.naipe,
          division: competition.division,
          required_match_count: requiredMatchCount,
          resolved_match_count: resolvedMatchCount,
          shortage_match_count: Math.max(
            0,
            requiredMatchCount - resolvedMatchCount,
          ),
          excess_match_count: Math.max(0, resolvedMatchCount - requiredMatchCount),
        };
      },
    );

  return {
    line_recommendations: lineRecommendations.map((recommendationLine) => {
      const summary = sportSummaryBySportId[recommendationLine.sport_id];

      return {
        ...recommendationLine,
        required_match_count: summary?.required_match_count ?? 0,
        resolved_match_count: summary?.resolved_match_count ?? 0,
        shortage_match_count: summary?.shortage_match_count ?? 0,
        excess_match_count: summary?.excess_match_count ?? 0,
      };
    }),
    sport_summaries: Object.values(sportSummaryBySportId),
    competition_summaries: competitionSummaries,
  };
}

export function resolveChampionshipBracketReviewConfigurationSummary({
  payload,
  championshipSports,
}: {
  payload: ChampionshipBracketSetupFormValues;
  championshipSports: ChampionshipSport[];
}): ChampionshipBracketReviewConfigurationSummary {
  const sportMetadataBySportId =
    resolveSportMetadataBySportId(championshipSports);
  const teamIdsByCompetitionKey = payload.competitions.reduce<
    Record<string, string[]>
  >((carry, competition) => {
    const competitionKey = resolveCompetitionKey(competition);

    carry[competitionKey] = payload.participants
      .filter((participant) =>
        participant.modalities.some(
          (modality) =>
            modality.sport_id == competition.sport_id &&
            modality.naipe == competition.naipe &&
            modality.division == competition.division,
        ),
      )
      .map((participant) => participant.team_id);

    return carry;
  }, {});
  const collectiveCompetitions = payload.competitions
    .filter(
      (competition) =>
        !sportMetadataBySportId[competition.sport_id]?.is_individual,
    )
    .map((competition) => {
      const competitionKey = resolveCompetitionKey(competition);
      const matchDescriptors = resolveCompetitionEstimatedMatchDescriptors({
        competition,
        sportName:
          sportMetadataBySportId[competition.sport_id]?.sport_name ??
          "Modalidade",
        durationMinutes:
          sportMetadataBySportId[competition.sport_id]
            ?.default_match_duration_minutes ??
          DEFAULT_MATCH_DURATION_MINUTES,
        teamIds: teamIdsByCompetitionKey[competitionKey] ?? [],
      });
      const knockoutProjection = resolveChampionshipBracketKnockoutProjection({
        groups_count: competition.groups_count,
        qualifiers_per_group: competition.qualifiers_per_group,
        should_complete_knockout_with_best_second_placed_teams:
          competition.should_complete_knockout_with_best_second_placed_teams,
      });

      return {
        competition_key: competitionKey,
        sport_id: competition.sport_id,
        sport_name:
          sportMetadataBySportId[competition.sport_id]?.sport_name ??
          "Modalidade",
        naipe: competition.naipe,
        division: competition.division,
        expected_match_count:
          matchDescriptors.length +
          (knockoutProjection.projected_bracket_size >= 2 ? 1 : 0),
      };
    })
    .sort((left, right) => {
      const sportNameComparison = left.sport_name.localeCompare(
        right.sport_name,
        "pt-BR",
        { sensitivity: "base" },
      );

      if (sportNameComparison != 0) {
        return sportNameComparison;
      }

      const naipeComparison = left.naipe.localeCompare(right.naipe);

      if (naipeComparison != 0) {
        return naipeComparison;
      }

      return (left.division ?? "").localeCompare(right.division ?? "");
    });
  const individualSessionSummaryByKey = new Map<
    string,
    ChampionshipBracketReviewConfigurationSummary["individual_sessions"][number]
  >();

  payload.individual_session_configs.forEach((sessionConfig) => {
    const sportMetadata = sportMetadataBySportId[sessionConfig.sport_id];

    if (!sportMetadata?.is_individual) {
      return;
    }

    const summaryKey = resolveCompetitionKey(sessionConfig);
    const existingSummary = individualSessionSummaryByKey.get(summaryKey);

    individualSessionSummaryByKey.set(summaryKey, {
      sport_id: sessionConfig.sport_id,
      sport_name: sportMetadata.sport_name,
      naipe: sessionConfig.naipe,
      division: sessionConfig.division,
      configured_session_count:
        (existingSummary?.configured_session_count ?? 0) + 1,
    });
  });

  const individualSessions = [...individualSessionSummaryByKey.values()].sort(
    (left, right) => {
      const sportNameComparison = left.sport_name.localeCompare(
        right.sport_name,
        "pt-BR",
        { sensitivity: "base" },
      );

      if (sportNameComparison != 0) {
        return sportNameComparison;
      }

      const naipeComparison = left.naipe.localeCompare(right.naipe);

      if (naipeComparison != 0) {
        return naipeComparison;
      }

      return (left.division ?? "").localeCompare(right.division ?? "");
    },
  );

  return {
    collective_competitions: collectiveCompetitions,
    individual_sessions: individualSessions,
  };
}

export function resolveChampionshipBracketStructuralReview({
  payload,
  championshipSports,
  teams,
}: {
  payload: ChampionshipBracketSetupFormValues;
  championshipSports: ChampionshipSport[];
  teams: Pick<Team, "id" | "name">[];
}): ChampionshipBracketStructuralReviewResult {
  const sportMetadataBySportId =
    resolveSportMetadataBySportId(championshipSports);
  const teamNameById = teams.reduce<Record<string, string>>((carry, team) => {
    carry[team.id] = team.name;
    return carry;
  }, {});
  const collectiveCompetitions = payload.competitions.filter((competition) => {
    return !sportMetadataBySportId[competition.sport_id]?.is_individual;
  });
  const collectiveCompetitionKeys = collectiveCompetitions.map((competition) =>
    resolveCompetitionKey(competition),
  );
  const collectiveCompetitionKeysBySportId = collectiveCompetitions.reduce<
    Record<string, string[]>
  >((carry, competition) => {
    if (!carry[competition.sport_id]) {
      carry[competition.sport_id] = [];
    }

    carry[competition.sport_id].push(resolveCompetitionKey(competition));
    return carry;
  }, {});
  const collectiveTeamIdsByCompetitionKey = collectiveCompetitions.reduce<
    Record<string, string[]>
  >((carry, competition) => {
    const competitionKey = resolveCompetitionKey(competition);

    carry[competitionKey] = payload.participants
      .filter((participant) =>
        participant.modalities.some(
          (modality) =>
            modality.sport_id == competition.sport_id &&
            modality.naipe == competition.naipe &&
            modality.division == competition.division,
        ),
      )
      .map((participant) => participant.team_id);

    return carry;
  }, {});
  const competitionDateAvailabilityByKey =
    resolveCompetitionDateAvailabilityByKey(payload);
  const teamCompetitionDateAvailabilityByKey =
    resolveTeamCompetitionDateAvailabilityByKey(payload);
  const derivedSessionLockKeySet = new Set(
    payload.individual_session_configs
      .filter(
        (sessionConfig) =>
          sessionConfig.exclusive_lock_enabled == true &&
          sessionConfig.scheduled_date &&
          sessionConfig.start_time &&
          sessionConfig.end_time &&
          sessionConfig.location_key &&
          sessionConfig.court_key,
      )
      .map((sessionConfig) =>
        resolveIndividualSessionSharedSlotKey({
          sport_id: sessionConfig.sport_id,
          division: sessionConfig.division,
          scheduled_date: sessionConfig.scheduled_date,
          start_time: sessionConfig.start_time,
          end_time: sessionConfig.end_time,
          location_key: sessionConfig.location_key,
          court_key: sessionConfig.court_key,
        }),
      ),
  );
  const diagnostics: ChampionshipBracketStructuralReviewDiagnostic[] = [];
  const plannedCollectiveSportIdSet = new Set<string>();
  const estimatedMatchNumberByKey = new Map<string, number>();
  const consumedEstimatedDescriptorCountByCompetitionKey = new Map<
    string,
    number
  >();
  let plannedTargetCount = 0;
  let plannedMatchCount = 0;
  let collectivePlannedMinutes = 0;
  let blockedMinutes = 0;
  let freeMinutes = 0;
  let remainingMinutes = 0;
  let overflowMinutes = 0;
  let estimatedMatchCount = 0;
  let unallocatedMatchCount = 0;

  const days = payload.schedule_days.map((scheduleDay) => {
    const dayInterval = resolveDayInterval(scheduleDay);
    const breakInterval = resolveBreakInterval(scheduleDay);

    const locations = scheduleDay.locations.map((location) => {
      const courts = location.courts.map((court) => {
        const fixedEntries: ChampionshipBracketStructuralReviewTimelineEntry[] = [];
        const fixedBlockedIntervals: TimeInterval[] = [];

        if (breakInterval) {
          fixedEntries.push({
            type: "BREAK",
            start_time: resolveMinutesToTimeValue(breakInterval.start),
            end_time: resolveMinutesToTimeValue(breakInterval.end),
            duration_minutes: breakInterval.end - breakInterval.start,
            sport_id: null,
            sport_name: null,
            naipe: null,
            division: null,
            lock_mode: null,
            division_scope: null,
          });
          fixedBlockedIntervals.push(breakInterval);
        }

        payload.resource_locks
          .filter(
            (resourceLock) =>
              resourceLock.date == scheduleDay.date &&
              resourceLock.location_key == location.location_key &&
              resourceLock.court_key == court.court_key &&
              !derivedSessionLockKeySet.has(
                resolveIndividualSessionSharedSlotKey({
                  sport_id: resourceLock.sport_id,
                  division: resourceLock.division,
                  date: resourceLock.date,
                  start_time: resourceLock.start_time,
                  end_time: resourceLock.end_time,
                  location_key: resourceLock.location_key,
                  court_key: resourceLock.court_key,
                }),
              ),
          )
          .forEach((resourceLock) => {
            const interval =
              resourceLock.start_time && resourceLock.end_time
                ? {
                    start:
                      resolveTimeValueToMinutes(resourceLock.start_time) ?? 0,
                    end: resolveTimeValueToMinutes(resourceLock.end_time) ?? 0,
                  }
                : null;

            if (!interval || interval.end <= interval.start) {
              return;
            }

            fixedEntries.push({
              type: "RESOURCE_LOCK",
              start_time: resolveMinutesToTimeValue(interval.start),
              end_time: resolveMinutesToTimeValue(interval.end),
              duration_minutes: interval.end - interval.start,
              sport_id: resourceLock.sport_id ?? null,
              sport_name: resourceLock.sport_id
                ? (sportMetadataBySportId[resourceLock.sport_id]?.sport_name ??
                  "Modalidade")
                : null,
              naipe: resourceLock.naipe ?? null,
              division: resourceLock.division ?? null,
              lock_mode: resourceLock.lock_mode,
              division_scope: null,
            });
            fixedBlockedIntervals.push(interval);
          });

        payload.individual_session_configs
          .filter(
            (sessionConfig) =>
              sessionConfig.scheduled_date == scheduleDay.date &&
              sessionConfig.location_key == location.location_key &&
              sessionConfig.court_key == court.court_key &&
              sessionConfig.start_time != null &&
              sessionConfig.end_time != null,
          )
          .forEach((sessionConfig) => {
            const interval =
              sessionConfig.start_time && sessionConfig.end_time
                ? {
                    start:
                      resolveTimeValueToMinutes(sessionConfig.start_time) ?? 0,
                    end: resolveTimeValueToMinutes(sessionConfig.end_time) ?? 0,
                  }
                : null;

            if (!interval || interval.end <= interval.start) {
              return;
            }

            fixedEntries.push({
              type: "INDIVIDUAL_SESSION",
              start_time: resolveMinutesToTimeValue(interval.start),
              end_time: resolveMinutesToTimeValue(interval.end),
              duration_minutes: interval.end - interval.start,
              sport_id: sessionConfig.sport_id,
              sport_name:
                sportMetadataBySportId[sessionConfig.sport_id]?.sport_name ??
                "Modalidade",
              naipe: sessionConfig.naipe,
              division: sessionConfig.division,
              lock_mode: null,
              division_scope: null,
            });
            fixedBlockedIntervals.push(interval);
          });

        payload.knockout_program_blocks
          .filter(
            (programBlock) =>
              programBlock.date == scheduleDay.date &&
              programBlock.location_key == location.location_key &&
              programBlock.court_key == court.court_key &&
              programBlock.start_time &&
              programBlock.end_time,
          )
          .forEach((programBlock) => {
            const interval =
              programBlock.start_time && programBlock.end_time
                ? {
                    start:
                      resolveTimeValueToMinutes(programBlock.start_time) ?? 0,
                    end: resolveTimeValueToMinutes(programBlock.end_time) ?? 0,
                  }
                : null;

            if (!interval || interval.end <= interval.start) {
              return;
            }

            fixedEntries.push({
              type: "MANUAL_FINAL_BLOCK",
              start_time: resolveMinutesToTimeValue(interval.start),
              end_time: resolveMinutesToTimeValue(interval.end),
              duration_minutes: interval.end - interval.start,
              sport_id: programBlock.sport_id,
              sport_name:
                sportMetadataBySportId[programBlock.sport_id]?.sport_name ??
                "Modalidade",
              naipe: null,
              division: null,
              lock_mode: null,
              division_scope: programBlock.division_scope,
            });
            fixedBlockedIntervals.push(interval);
          });

        const conflictIntervals = fixedEntries
          .filter((entry) => entry.type != "BREAK")
          .map((entry) => ({
            entry,
            start: resolveTimeValueToMinutes(entry.start_time) ?? 0,
            end: resolveTimeValueToMinutes(entry.end_time) ?? 0,
          }))
          .sort((left, right) => left.start - right.start);

        for (
          let conflictIndex = 1;
          conflictIndex < conflictIntervals.length;
          conflictIndex += 1
        ) {
          const previousInterval = conflictIntervals[conflictIndex - 1];
          const currentInterval = conflictIntervals[conflictIndex];

          if (
            previousInterval &&
            currentInterval &&
            currentInterval.start < previousInterval.end
          ) {
            const canShareIndividualSessionSlot =
              previousInterval.entry.type == "INDIVIDUAL_SESSION" &&
              currentInterval.entry.type == "INDIVIDUAL_SESSION" &&
              resolveCanShareIndividualSessionSlot(
                {
                  sport_id: previousInterval.entry.sport_id,
                  naipe: previousInterval.entry.naipe,
                  division: previousInterval.entry.division,
                  date: scheduleDay.date,
                  start_time: previousInterval.entry.start_time,
                  end_time: previousInterval.entry.end_time,
                  location_key: location.location_key,
                  court_key: court.court_key,
                },
                {
                  sport_id: currentInterval.entry.sport_id,
                  naipe: currentInterval.entry.naipe,
                  division: currentInterval.entry.division,
                  date: scheduleDay.date,
                  start_time: currentInterval.entry.start_time,
                  end_time: currentInterval.entry.end_time,
                  location_key: location.location_key,
                  court_key: court.court_key,
                },
              );

            if (canShareIndividualSessionSlot) {
              continue;
            }

            diagnostics.push({
              code: "STRUCTURAL_FIXED_BLOCK_CONFLICT",
              severity: "ERROR",
              message:
                "Existem blocos fixos sobrepostos nesta quadra e o dia precisa ser revisado.",
              date: scheduleDay.date,
              location_name: location.name,
              court_name: court.name,
              sport_id: null,
              sport_name: null,
              team_id: null,
              team_name: null,
            });
            break;
          }
        }

        const mergedBlockedIntervals = resolveMergedIntervals(fixedBlockedIntervals);
        const blockedCourtMinutes = resolveIntervalsMinutes(mergedBlockedIntervals);
        const freeCourtIntervals =
          dayInterval != null
            ? resolveFreeIntervals({
                dayInterval,
                blockedIntervals: mergedBlockedIntervals,
              })
            : [];
        const freeCourtMinutes = resolveIntervalsMinutes(freeCourtIntervals);
        let accumulatedPlannedMinutes = 0;
        const selectedDescriptorCountByTargetKey = new Map<string, number>();
        const orderedEstimatedMatchDescriptors = (court.sport_match_targets ?? [])
          .flatMap((target) => {
            const targetKey = [
              scheduleDay.date,
              location.location_key,
              court.court_key,
              target.sport_id,
            ].join("::");
            const sportMetadata = sportMetadataBySportId[target.sport_id];
            const durationMinutes =
              sportMetadata?.default_match_duration_minutes ??
              DEFAULT_MATCH_DURATION_MINUTES;
            const orderedDescriptorQueue =
              resolveOrderedEstimatedMatchDescriptorQueue({
                target,
                courtPreference: court.sport_preference,
                competitions: collectiveCompetitions,
                sportName: sportMetadata?.sport_name ?? "Modalidade",
                durationMinutes,
                collectiveTeamIdsByCompetitionKey,
                scheduleDay,
                competitionDateAvailabilityByKey,
                consumedEstimatedDescriptorCountByCompetitionKey,
                requestedMatchCount: target.planned_match_count,
              });
            const selectedDescriptors = orderedDescriptorQueue.slice(
              0,
              target.planned_match_count,
            );
            selectedDescriptorCountByTargetKey.set(
              targetKey,
              selectedDescriptors.length,
            );

            selectedDescriptors.forEach((descriptor) => {
              if (!descriptor.competition_key) {
                return;
              }

              consumedEstimatedDescriptorCountByCompetitionKey.set(
                descriptor.competition_key,
                (consumedEstimatedDescriptorCountByCompetitionKey.get(
                  descriptor.competition_key,
                ) ?? 0) + 1,
              );
            });

            return selectedDescriptors;
          });

        const planningItems: ChampionshipBracketStructuralReviewPlanningItem[] = (
          court.sport_match_targets ?? []
        ).map((target) => {
          const targetKey = [
            scheduleDay.date,
            location.location_key,
            court.court_key,
            target.sport_id,
          ].join("::");
          plannedCollectiveSportIdSet.add(target.sport_id);
          plannedTargetCount += 1;
          plannedMatchCount += target.planned_match_count;

          const sportMetadata = sportMetadataBySportId[target.sport_id];
          const durationMinutes =
            sportMetadata?.default_match_duration_minutes ??
            DEFAULT_MATCH_DURATION_MINUTES;
          const plannedMinutes = target.planned_match_count * durationMinutes;
          const sportCompetitionKeys =
            collectiveCompetitionKeysBySportId[target.sport_id] ?? [];
          const hasPlayableWindow = sportCompetitionKeys.some((competitionKey) => {
            const competitionAvailability =
              competitionDateAvailabilityByKey.get(
                `${competitionKey}::${scheduleDay.date}`,
              ) ??
              ({
                competition_key: competitionKey,
                date: scheduleDay.date,
                mode: "FULL_DAY",
                windows: [],
              } satisfies ChampionshipBracketCompetitionDateAvailabilityInput);

            const competitionIntervals = resolveAvailabilityIntervals({
              scheduleDay,
              mode: competitionAvailability.mode,
              windows: competitionAvailability.windows,
            });

            return competitionIntervals.length > 0;
          });

          if (!hasPlayableWindow) {
            diagnostics.push({
              code: "STRUCTURAL_TARGET_WITHOUT_PLAYABLE_WINDOW",
              severity: "ERROR",
              message: `A meta planejada de ${
                sportMetadata?.sport_name ?? "uma modalidade"
              } não possui janela jogável nesta data.`,
              date: scheduleDay.date,
              location_name: location.name,
              court_name: court.name,
              sport_id: target.sport_id,
              sport_name: sportMetadata?.sport_name ?? "Modalidade",
              team_id: null,
              team_name: null,
            });
          }

          const selectedDescriptorCount =
            selectedDescriptorCountByTargetKey.get(targetKey) ?? 0;

          if (
            hasPlayableWindow &&
            selectedDescriptorCount < target.planned_match_count
          ) {
            diagnostics.push({
              code: "STRUCTURAL_TARGET_ABOVE_REQUIRED_MATCH_COUNT",
              severity: "WARNING",
              message: `A quantidade planejada de ${
                sportMetadata?.sport_name ?? "uma modalidade"
              } nesta quadra está ${
                target.planned_match_count - selectedDescriptorCount
              } jogo(s) acima do total automático necessário no campeonato.`,
              date: scheduleDay.date,
              location_name: location.name,
              court_name: court.name,
              sport_id: target.sport_id,
              sport_name: sportMetadata?.sport_name ?? "Modalidade",
              team_id: null,
              team_name: null,
            });
          }

          const restrictedTeamIds = new Set<string>();

          sportCompetitionKeys.forEach((competitionKey) => {
            const competitionAvailability =
              competitionDateAvailabilityByKey.get(
                `${competitionKey}::${scheduleDay.date}`,
              ) ??
              ({
                competition_key: competitionKey,
                date: scheduleDay.date,
                mode: "FULL_DAY",
                windows: [],
              } satisfies ChampionshipBracketCompetitionDateAvailabilityInput);

            const competitionIntervals = resolveAvailabilityIntervals({
              scheduleDay,
              mode: competitionAvailability.mode,
              windows: competitionAvailability.windows,
            });

            if (competitionIntervals.length == 0) {
              return;
            }

            (collectiveTeamIdsByCompetitionKey[competitionKey] ?? []).forEach(
              (teamId) => {
                const teamAvailability =
                  teamCompetitionDateAvailabilityByKey.get(
                    `${teamId}::${competitionKey}::${scheduleDay.date}`,
                  ) ??
                  ({
                    team_id: teamId,
                    competition_key: competitionKey,
                    date: scheduleDay.date,
                    mode: "FULL_DAY",
                    windows: [],
                  } satisfies ChampionshipBracketTeamCompetitionDateAvailabilityInput);

                const teamIntervals = resolveAvailabilityIntervals({
                  scheduleDay,
                  mode: teamAvailability.mode,
                  windows: teamAvailability.windows,
                });

                const intersectionIntervals = resolveIntersectedIntervals(
                  competitionIntervals,
                  teamIntervals,
                );
                const intersectionMinutes =
                  resolveIntervalsMinutes(intersectionIntervals);

                if (intersectionMinutes < durationMinutes) {
                  restrictedTeamIds.add(teamId);
                }
              },
            );
          });

          if (restrictedTeamIds.size > 0) {
            diagnostics.push({
              code: "STRUCTURAL_RESTRICTED_TEAM_AVAILABILITY",
              severity: "WARNING",
              message: `A disponibilidade das atléticas para ${
                sportMetadata?.sport_name ?? "a modalidade"
              } em ${scheduleDay.date} está restrita para ${
                restrictedTeamIds.size
              } participante(s) da fase de grupos.`,
              date: scheduleDay.date,
              location_name: location.name,
              court_name: court.name,
              sport_id: target.sport_id,
              sport_name: sportMetadata?.sport_name ?? "Modalidade",
              team_id: null,
              team_name: null,
            });
          }

          collectivePlannedMinutes += plannedMinutes;
          accumulatedPlannedMinutes += plannedMinutes;
          const { remainingMinutes, additionalMatchCapacity } =
            resolveRemainingCapacityMetrics({
              freeMinutes: freeCourtMinutes,
              accumulatedMinutes: accumulatedPlannedMinutes,
              matchDurationMinutes: durationMinutes,
            });

          return {
            type: "SPORT_TARGET",
            sport_id: target.sport_id,
            sport_name: sportMetadata?.sport_name ?? "Modalidade",
            planned_match_count: target.planned_match_count,
            match_duration_minutes: durationMinutes,
            planned_minutes: plannedMinutes,
            free_minutes: freeCourtMinutes,
            remaining_minutes: remainingMinutes,
            additional_match_capacity: additionalMatchCapacity,
            overflow_minutes: Math.max(
              0,
              accumulatedPlannedMinutes - freeCourtMinutes,
            ),
            status: resolvePlanningItemStatus({
              accumulatedMinutes: accumulatedPlannedMinutes,
              freeMinutes: freeCourtMinutes,
            }),
            has_playable_window: hasPlayableWindow,
          };
        });

        const estimatedMatchEntries: ChampionshipBracketStructuralReviewEstimatedMatchEntry[] =
          [];
        const pendingMatchEntries: ChampionshipBracketStructuralReviewPendingMatchEntry[] =
          [];
        let freeIntervalIndex = 0;
        let currentFreeIntervalCursor = freeCourtIntervals[0]?.start ?? null;

        orderedEstimatedMatchDescriptors.forEach((descriptor) => {
          const numberingKey =
            payload.match_numbering_mode == "SPORT_NAIPE"
              ? `${descriptor.sport_id}::${descriptor.naipe}`
              : payload.match_numbering_mode == "SPORT"
                ? descriptor.sport_id
              : `${location.location_key}::${court.court_key}`;
          const nextMatchNumber =
            (estimatedMatchNumberByKey.get(numberingKey) ?? 0) + 1;

          estimatedMatchNumberByKey.set(numberingKey, nextMatchNumber);

          while (freeIntervalIndex < freeCourtIntervals.length) {
            const currentFreeInterval = freeCourtIntervals[freeIntervalIndex];

            if (!currentFreeInterval) {
              break;
            }

            const currentStart =
              currentFreeIntervalCursor ?? currentFreeInterval.start;

            if (
              currentStart + descriptor.duration_minutes <=
              currentFreeInterval.end
            ) {
              estimatedMatchEntries.push({
                sport_id: descriptor.sport_id,
                sport_name: descriptor.sport_name,
                naipe: descriptor.naipe,
                division: descriptor.division,
                phase: descriptor.phase,
                phase_label: descriptor.phase_label,
                duration_minutes: descriptor.duration_minutes,
                match_number: nextMatchNumber,
                start_time: resolveMinutesToTimeValue(currentStart),
                end_time: resolveMinutesToTimeValue(
                  currentStart + descriptor.duration_minutes,
                ),
                estimated: true,
              });
              estimatedMatchCount += 1;
              currentFreeIntervalCursor =
                currentStart + descriptor.duration_minutes;
              return;
            }

            freeIntervalIndex += 1;
            currentFreeIntervalCursor =
              freeCourtIntervals[freeIntervalIndex]?.start ?? null;
          }

          unallocatedMatchCount += 1;
          pendingMatchEntries.push({
            sport_id: descriptor.sport_id,
            sport_name: descriptor.sport_name,
            naipe: descriptor.naipe,
            division: descriptor.division,
            phase: descriptor.phase,
            phase_label: descriptor.phase_label,
            match_number: nextMatchNumber,
            estimated: true,
          });
        });

        const plannedCourtMinutes = planningItems.reduce(
          (totalMinutes, planningItem) =>
            totalMinutes + planningItem.planned_minutes,
          0,
        );
        const courtOverflowMinutes = Math.max(
          0,
          plannedCourtMinutes - freeCourtMinutes,
        );

        if (courtOverflowMinutes > 0) {
          diagnostics.push({
            code: "STRUCTURAL_COURT_DAY_OVERFLOW",
            severity: "ERROR",
            message:
              "A soma dos minutos planejados excede a capacidade livre desta quadra no dia.",
            date: scheduleDay.date,
            location_name: location.name,
            court_name: court.name,
            sport_id: null,
            sport_name: null,
            team_id: null,
            team_name: null,
          });
        }

        blockedMinutes += blockedCourtMinutes;
        freeMinutes += freeCourtMinutes;
        remainingMinutes += Math.max(0, freeCourtMinutes - plannedCourtMinutes);
        overflowMinutes += courtOverflowMinutes;

        const timelineEntries = [
          ...fixedEntries,
          ...freeCourtIntervals.map(
            (interval): ChampionshipBracketStructuralReviewTimelineEntry => ({
              type: "FREE_WINDOW",
              start_time: resolveMinutesToTimeValue(interval.start),
              end_time: resolveMinutesToTimeValue(interval.end),
              duration_minutes: interval.end - interval.start,
              sport_id: null,
              sport_name: null,
              naipe: null,
              division: null,
              lock_mode: null,
              division_scope: null,
            }),
          ),
        ].sort((left, right) => {
          const leftStart = resolveTimeValueToMinutes(left.start_time) ?? 0;
          const rightStart = resolveTimeValueToMinutes(right.start_time) ?? 0;

          if (leftStart == rightStart) {
            return (
              (resolveTimeValueToMinutes(left.end_time) ?? 0) -
              (resolveTimeValueToMinutes(right.end_time) ?? 0)
            );
          }

          return leftStart - rightStart;
        });

        return {
          court_key: court.court_key,
          court_name: court.name,
          blocked_minutes: blockedCourtMinutes,
          free_minutes: freeCourtMinutes,
          planned_collective_minutes: plannedCourtMinutes,
          overflow_minutes: courtOverflowMinutes,
          timeline_entries: timelineEntries,
          estimated_match_entries: estimatedMatchEntries,
          unallocated_match_count: Math.max(
            0,
            orderedEstimatedMatchDescriptors.length - estimatedMatchEntries.length,
          ),
          pending_match_entries: pendingMatchEntries,
          planning_items: planningItems,
        } satisfies ChampionshipBracketStructuralReviewCourt;
      });

      return {
        location_key: location.location_key,
        location_name: location.name,
        courts,
      } satisfies ChampionshipBracketStructuralReviewLocation;
    });

    return {
      date: scheduleDay.date,
      start_time: scheduleDay.start_time,
      end_time: scheduleDay.end_time,
      locations,
    };
  });

  const collectiveSportIds = [
    ...new Set(collectiveCompetitions.map((competition) => competition.sport_id)),
  ];

  collectiveSportIds.forEach((sportId) => {
    if (plannedCollectiveSportIdSet.has(sportId)) {
      return;
    }

    diagnostics.push({
      code: "STRUCTURAL_COLLECTIVE_SPORT_WITHOUT_TARGET",
      severity: "ERROR",
      message: `${
        sportMetadataBySportId[sportId]?.sport_name ?? "Uma modalidade coletiva"
      } está ativa no campeonato, mas ainda não possui meta planejada.`,
      date: null,
      location_name: null,
      court_name: null,
      sport_id: sportId,
      sport_name: sportMetadataBySportId[sportId]?.sport_name ?? "Modalidade",
      team_id: null,
      team_name: null,
    });
  });

  const result: ChampionshipBracketStructuralReviewResult = {
    summary: {
      planned_target_count: plannedTargetCount,
      planned_match_count: plannedMatchCount,
      collective_planned_minutes: collectivePlannedMinutes,
      blocked_minutes: blockedMinutes,
      free_minutes: freeMinutes,
      remaining_minutes: remainingMinutes,
      overflow_minutes: overflowMinutes,
      estimated_match_count: estimatedMatchCount,
      unallocated_match_count: unallocatedMatchCount,
      diagnostics_count: diagnostics.length,
    },
    days,
    diagnostics,
  };

  return result;
}
