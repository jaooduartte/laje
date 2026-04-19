import type { ChampionshipBracketTieBreakPendingContext } from "@/domain/championship-brackets/championshipBracket.types";

export function resolveNormalizedTieBreakTeamOrder(
  pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
  orderedTeamIds: string[] | undefined,
): string[] {
  return pendingTieBreakContext.teams.map((_, teamIndex) => orderedTeamIds?.[teamIndex] ?? "");
}

export function resolveIsTieBreakTeamOrderReady(
  pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
  orderedTeamIds: string[] | undefined,
): boolean {
  const normalizedTieBreakTeamOrder = resolveNormalizedTieBreakTeamOrder(pendingTieBreakContext, orderedTeamIds);
  const validTeamIdSet = new Set(pendingTieBreakContext.teams.map((team) => team.team_id));
  const selectedTeamIds = normalizedTieBreakTeamOrder.filter((teamId) => teamId.length > 0);

  if (selectedTeamIds.length != pendingTieBreakContext.teams.length) {
    return false;
  }

  if (selectedTeamIds.some((teamId) => !validTeamIdSet.has(teamId))) {
    return false;
  }

  return new Set(selectedTeamIds).size == pendingTieBreakContext.teams.length;
}
