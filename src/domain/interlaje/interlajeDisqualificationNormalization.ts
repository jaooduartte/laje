import type { CompetitionTeamDisqualification } from "@/lib/types";
import type {
  InterlajeCompetitionStanding,
  InterlajeOverallStanding,
  InterlajePositionPointSetting,
} from "@/domain/interlaje/interlajeOverallStandings.repository";

export interface InterlajeDisqualificationContext {
  sport_id: string;
  naipe: CompetitionTeamDisqualification["naipe"];
  division: CompetitionTeamDisqualification["division"];
}

export interface InterlajePlacementAdjustment {
  total: number;
  confirmed: number;
  projected: number;
}

function resolveDivisionKey(division: CompetitionTeamDisqualification["division"]) {
  return division ?? "WITHOUT_DIVISION";
}

function resolveContextKey(context: InterlajeDisqualificationContext) {
  return [context.sport_id, context.naipe, resolveDivisionKey(context.division)].join(":");
}

export function isSameInterlajeDisqualificationContext(
  disqualification: CompetitionTeamDisqualification,
  context: InterlajeDisqualificationContext,
) {
  return (
    disqualification.sport_id == context.sport_id &&
    disqualification.naipe == context.naipe &&
    disqualification.division == context.division
  );
}

export function resolveInterlajeDisqualificationContexts(
  disqualifications: CompetitionTeamDisqualification[],
): InterlajeDisqualificationContext[] {
  const contexts = new Map<string, InterlajeDisqualificationContext>();

  disqualifications.forEach((disqualification) => {
    const context: InterlajeDisqualificationContext = {
      sport_id: disqualification.sport_id,
      naipe: disqualification.naipe,
      division: disqualification.division,
    };

    contexts.set(resolveContextKey(context), context);
  });

  return [...contexts.values()];
}

function withEffectivePlacementContext(
  classificationPolicy: Record<string, unknown> | undefined,
  finalPosition: number,
) {
  if (!classificationPolicy) {
    return classificationPolicy;
  }

  const placementContext = classificationPolicy.placement_context;
  if (
    placementContext == null ||
    typeof placementContext != "object" ||
    Array.isArray(placementContext)
  ) {
    return classificationPolicy;
  }

  return {
    ...classificationPolicy,
    placement_context: {
      ...(placementContext as Record<string, unknown>),
      final_position: finalPosition,
    },
  };
}

export function normalizeInterlajeCompetitionStandingsAfterDisqualification(
  standings: InterlajeCompetitionStanding[],
  disqualifiedTeamIds: Set<string>,
  positionPointSettings: InterlajePositionPointSetting[],
): InterlajeCompetitionStanding[] {
  if (standings.length == 0 || disqualifiedTeamIds.size == 0) {
    return standings;
  }

  const pointsByPosition = new Map(
    positionPointSettings.map((setting) => [setting.final_position, setting.points]),
  );
  const rowsByDivision = new Map<string, InterlajeCompetitionStanding[]>();

  standings.forEach((standing) => {
    const divisionKey = resolveDivisionKey(standing.division);
    const rows = rowsByDivision.get(divisionKey) ?? [];
    rows.push(standing);
    rowsByDivision.set(divisionKey, rows);
  });

  return [...rowsByDivision.values()].flatMap((divisionRows) => {
    const orderedRows = [...divisionRows].sort((firstRow, secondRow) => {
      const firstPosition = firstRow.final_position ?? Number.MAX_SAFE_INTEGER;
      const secondPosition = secondRow.final_position ?? Number.MAX_SAFE_INTEGER;
      return firstPosition - secondPosition || firstRow.team_id.localeCompare(secondRow.team_id);
    });
    const eligibleRows = orderedRows.filter((row) => !disqualifiedTeamIds.has(row.team_id));
    const disqualifiedRows = orderedRows.filter((row) => disqualifiedTeamIds.has(row.team_id));
    const lastPosition = orderedRows.reduce(
      (maximum, row) => Math.max(maximum, Number(row.final_position) || 0),
      orderedRows.length,
    );
    const trailingDisqualifiedStart = lastPosition - disqualifiedRows.length + 1;

    const normalizedEligibleRows = eligibleRows.map((row) => {
      const removedPositionsBefore = disqualifiedRows.filter(
        (disqualifiedRow) =>
          Number(disqualifiedRow.final_position) < Number(row.final_position),
      ).length;
      const finalPosition = Math.max(1, Number(row.final_position) - removedPositionsBefore);
      const canReceivePlacementPoints = row.placement_points > 0;

      return {
        ...row,
        final_position: finalPosition,
        placement_points: canReceivePlacementPoints
          ? (pointsByPosition.get(finalPosition) ?? 0)
          : 0,
        classification_policy: withEffectivePlacementContext(
          row.classification_policy,
          finalPosition,
        ),
      };
    });

    const normalizedDisqualifiedRows = disqualifiedRows.map((row, index) => {
      const finalPosition = trailingDisqualifiedStart + index;

      return {
        ...row,
        final_position: finalPosition,
        placement_points: 0,
        classification_policy: withEffectivePlacementContext(
          row.classification_policy,
          finalPosition,
        ),
      };
    });

    return [...normalizedEligibleRows, ...normalizedDisqualifiedRows];
  });
}

export function resolveInterlajePlacementAdjustments(
  originalStandings: InterlajeCompetitionStanding[],
  normalizedStandings: InterlajeCompetitionStanding[],
): Map<string, InterlajePlacementAdjustment> {
  const normalizedByTeamId = new Map(
    normalizedStandings.map((standing) => [standing.team_id, standing]),
  );
  const adjustments = new Map<string, InterlajePlacementAdjustment>();

  originalStandings.forEach((standing) => {
    const normalizedStanding = normalizedByTeamId.get(standing.team_id);
    if (!normalizedStanding) {
      return;
    }

    const delta = Number(normalizedStanding.placement_points) - Number(standing.placement_points);
    if (delta == 0) {
      return;
    }

    const currentAdjustment = adjustments.get(standing.team_id) ?? {
      total: 0,
      confirmed: 0,
      projected: 0,
    };

    currentAdjustment.total += delta;
    if (standing.placement_status == "CONFIRMED") {
      currentAdjustment.confirmed += delta;
    } else if (standing.placement_status == "PROJECTED") {
      currentAdjustment.projected += delta;
    }

    adjustments.set(standing.team_id, currentAdjustment);
  });

  return adjustments;
}

export function mergeInterlajePlacementAdjustments(
  target: Map<string, InterlajePlacementAdjustment>,
  source: Map<string, InterlajePlacementAdjustment>,
) {
  source.forEach((sourceAdjustment, teamId) => {
    const targetAdjustment = target.get(teamId) ?? {
      total: 0,
      confirmed: 0,
      projected: 0,
    };

    targetAdjustment.total += sourceAdjustment.total;
    targetAdjustment.confirmed += sourceAdjustment.confirmed;
    targetAdjustment.projected += sourceAdjustment.projected;
    target.set(teamId, targetAdjustment);
  });

  return target;
}

export function applyInterlajePlacementAdjustmentsToOverallStandings(
  standings: InterlajeOverallStanding[],
  adjustments: Map<string, InterlajePlacementAdjustment>,
): InterlajeOverallStanding[] {
  const originalOrder = new Map(standings.map((standing, index) => [standing.team_id, index]));

  return standings
    .map((standing) => {
      const adjustment = adjustments.get(standing.team_id);
      if (!adjustment) {
        return standing;
      }

      return {
        ...standing,
        placement_points: Number(standing.placement_points) + adjustment.total,
        confirmed_placement_points:
          Number(standing.confirmed_placement_points) + adjustment.confirmed,
        projected_placement_points:
          Number(standing.projected_placement_points) + adjustment.projected,
        overall_points: Number(standing.overall_points) + adjustment.total,
      };
    })
    .sort((firstStanding, secondStanding) => {
      return (
        Number(secondStanding.overall_points) - Number(firstStanding.overall_points) ||
        (originalOrder.get(firstStanding.team_id) ?? Number.MAX_SAFE_INTEGER) -
          (originalOrder.get(secondStanding.team_id) ?? Number.MAX_SAFE_INTEGER)
      );
    });
}
