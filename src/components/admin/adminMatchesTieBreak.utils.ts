import type { ChampionshipBracketTieBreakPendingContext } from "@/domain/championship-brackets/championshipBracket.types";

export function resolveNormalizedTieBreakTeamOrder(
  pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
  orderedTeamIds: string[] | undefined,
): string[] {
  return pendingTieBreakContext.teams.map((_, teamIndex) => orderedTeamIds?.[teamIndex] ?? "");
}

export function reconcileTieBreakDraftTeamOrders(
  pendingTieBreakContexts: ChampionshipBracketTieBreakPendingContext[],
  draftTeamIdsByContextKey: Record<string, string[]>,
): Record<string, string[]> {
  return pendingTieBreakContexts.reduce<Record<string, string[]>>(
    (drafts, pendingTieBreakContext) => {
      const validTeamIds = new Set(pendingTieBreakContext.teams.map((team) => team.team_id));
      const selectedTeamIds = new Set<string>();
      const currentTeamIds = draftTeamIdsByContextKey[pendingTieBreakContext.context_key] ?? [];

      drafts[pendingTieBreakContext.context_key] = pendingTieBreakContext.teams.map(
        (_, teamIndex) => {
          const teamId = currentTeamIds[teamIndex] ?? "";

          if (!teamId || !validTeamIds.has(teamId) || selectedTeamIds.has(teamId)) {
            return "";
          }

          selectedTeamIds.add(teamId);
          return teamId;
        },
      );

      return drafts;
    },
    {},
  );
}

export function resolveIsTieBreakTeamOrderReady(
  pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
  orderedTeamIds: string[] | undefined,
): boolean {
  if (pendingTieBreakContext.teams.length < 2) {
    return false;
  }

  const normalizedTieBreakTeamOrder = resolveNormalizedTieBreakTeamOrder(
    pendingTieBreakContext,
    orderedTeamIds,
  );
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
