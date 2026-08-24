import type { TeamStandingAggregate } from "@/lib/standings";
import type { InterlajeOverallStanding } from "@/domain/interlaje/interlajeOverallStandings.repository";

export function resolveInterlajeOverallStandingAggregates(
  standings: InterlajeOverallStanding[],
): TeamStandingAggregate[] {
  return standings.map((standing) => ({
    team_id: standing.team_id,
    team_name: standing.team_name,
    team_city: "",
    division: null,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,
    goal_diff: 0,
    points: standing.overall_points,
    yellow_cards: 0,
    red_cards: 0,
  }));
}

export function resolveInterlajeOverallPendingTieBreakTeamIds(
  standings: InterlajeOverallStanding[],
): Set<string> {
  return new Set(
    standings
      .filter((standing) => standing.has_pending_tie_break)
      .map((standing) => standing.team_id),
  );
}
