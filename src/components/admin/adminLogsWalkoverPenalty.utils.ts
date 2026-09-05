type TeamNameById = Record<string, string>;

interface WalkoverPenaltyCount {
  teamId: string;
  walkoverCount: number;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value == "object" && value != null && !Array.isArray(value);
}

function resolveWalkoverPenaltyCounts(value: unknown): WalkoverPenaltyCount[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const counts = value.map((item) => {
    if (
      !isRecordValue(item) ||
      typeof item.team_id != "string" ||
      item.team_id.length == 0 ||
      typeof item.walkover_count != "number" ||
      !Number.isInteger(item.walkover_count) ||
      item.walkover_count < 0
    ) {
      return null;
    }

    return {
      teamId: item.team_id,
      walkoverCount: item.walkover_count,
    } satisfies WalkoverPenaltyCount;
  });

  return counts.every((count) => count != null) ? counts : null;
}

export function resolveWalkoverPenaltyCountChanges(
  previousValue: unknown,
  nextValue: unknown,
  teamNameById: TeamNameById,
): string[] | null {
  const previousCounts = resolveWalkoverPenaltyCounts(previousValue);
  const nextCounts = resolveWalkoverPenaltyCounts(nextValue);

  if (previousCounts == null || nextCounts == null) {
    return null;
  }

  const previousCountByTeamId = new Map(
    previousCounts.map((count) => [count.teamId, count.walkoverCount]),
  );
  const nextCountByTeamId = new Map(
    nextCounts.map((count) => [count.teamId, count.walkoverCount]),
  );

  return [...new Set([...previousCountByTeamId.keys(), ...nextCountByTeamId.keys()])]
    .filter(
      (teamId) =>
        previousCountByTeamId.get(teamId) != nextCountByTeamId.get(teamId),
    )
    .sort((firstTeamId, secondTeamId) =>
      (teamNameById[firstTeamId] ?? firstTeamId).localeCompare(
        teamNameById[secondTeamId] ?? secondTeamId,
      ),
    )
    .map((teamId) => {
      const teamName = teamNameById[teamId] ?? "Atlética cadastrada";
      const previousCount = previousCountByTeamId.get(teamId) ?? 0;
      const nextCount = nextCountByTeamId.get(teamId) ?? 0;

      return `${teamName}: ${previousCount} para ${nextCount} W.O.`;
    });
}
