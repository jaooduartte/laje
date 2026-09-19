import type { TeamStandingAggregate } from "@/lib/standings";
import type { ChampionshipGroupStageStanding } from "@/domain/championship-brackets/championshipBracket.types";

export function toTeamStandingAggregate(
  standing: ChampionshipGroupStageStanding,
): TeamStandingAggregate {
  return {
    team_id: standing.team_id,
    team_name: standing.team_name,
    team_city: "",
    division: standing.division,
    played: standing.played,
    wins: standing.wins,
    draws: standing.draws,
    losses: standing.losses,
    goals_for: standing.goals_for,
    goals_against: standing.goals_against,
    goal_diff: standing.goal_diff,
    points: standing.points,
    yellow_cards: standing.yellow_cards,
    red_cards: standing.red_cards,
    blue_cards: standing.blue_cards,
    two_minute_penalties: standing.two_minute_penalties,
    sets_for: standing.sets_for,
    sets_against: standing.sets_against,
    rally_points_for: standing.rally_points_for,
    rally_points_against: standing.rally_points_against,
  };
}
