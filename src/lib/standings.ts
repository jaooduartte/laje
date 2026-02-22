import type { MatchNaipe, TeamDivision } from "@/lib/enums";
import type { Standing } from "@/lib/types";

export interface TeamStandingAggregate {
  team_id: string;
  team_name: string;
  team_city: string;
  division: TeamDivision | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
}

function resolveStandingTeamName(standing: Standing): string {
  return standing.teams?.name ?? "Atlética";
}

function resolveStandingTeamCity(standing: Standing): string {
  return standing.teams?.city ?? "";
}

export function sortStandingsByRanking(standings: Standing[]): Standing[] {
  return [...standings].sort((firstStanding, secondStanding) => {
    if (firstStanding.points !== secondStanding.points) {
      return secondStanding.points - firstStanding.points;
    }

    if (firstStanding.goal_diff !== secondStanding.goal_diff) {
      return secondStanding.goal_diff - firstStanding.goal_diff;
    }

    if (firstStanding.goals_for !== secondStanding.goals_for) {
      return secondStanding.goals_for - firstStanding.goals_for;
    }

    if (firstStanding.wins !== secondStanding.wins) {
      return secondStanding.wins - firstStanding.wins;
    }

    return resolveStandingTeamName(firstStanding).localeCompare(resolveStandingTeamName(secondStanding));
  });
}

export function aggregateStandingsByTeam(standings: Standing[]): TeamStandingAggregate[] {
  const teamStandingMap = new Map<string, TeamStandingAggregate>();

  standings.forEach((standing) => {
    const teamStandingKey = `${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`;
    const existingTeamStanding = teamStandingMap.get(teamStandingKey);

    if (existingTeamStanding) {
      existingTeamStanding.played += standing.played;
      existingTeamStanding.wins += standing.wins;
      existingTeamStanding.draws += standing.draws;
      existingTeamStanding.losses += standing.losses;
      existingTeamStanding.goals_for += standing.goals_for;
      existingTeamStanding.goals_against += standing.goals_against;
      existingTeamStanding.goal_diff += standing.goal_diff;
      existingTeamStanding.points += standing.points;
      return;
    }

    teamStandingMap.set(teamStandingKey, {
      team_id: standing.team_id,
      team_name: resolveStandingTeamName(standing),
      team_city: resolveStandingTeamCity(standing),
      division: standing.division,
      played: standing.played,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      goals_for: standing.goals_for,
      goals_against: standing.goals_against,
      goal_diff: standing.goal_diff,
      points: standing.points,
    });
  });

  return [...teamStandingMap.values()].sort((firstTeamStanding, secondTeamStanding) => {
    if (firstTeamStanding.points !== secondTeamStanding.points) {
      return secondTeamStanding.points - firstTeamStanding.points;
    }

    if (firstTeamStanding.goal_diff !== secondTeamStanding.goal_diff) {
      return secondTeamStanding.goal_diff - firstTeamStanding.goal_diff;
    }

    if (firstTeamStanding.goals_for !== secondTeamStanding.goals_for) {
      return secondTeamStanding.goals_for - firstTeamStanding.goals_for;
    }

    if (firstTeamStanding.wins !== secondTeamStanding.wins) {
      return secondTeamStanding.wins - firstTeamStanding.wins;
    }

    return firstTeamStanding.team_name.localeCompare(secondTeamStanding.team_name);
  });
}

export function aggregateStandingsByNaipe(standings: Standing[], naipe: MatchNaipe): TeamStandingAggregate[] {
  const standingsForNaipe = standings.filter((standing) => standing.naipe === naipe);
  return aggregateStandingsByTeam(standingsForNaipe);
}

export interface StandingsBySportGroup {
  sport_id: string;
  sport_name: string;
  standings: Standing[];
}

export function groupStandingsBySport(standings: Standing[]): StandingsBySportGroup[] {
  const standingsBySportMap = new Map<string, StandingsBySportGroup>();

  standings.forEach((standing) => {
    const existingSportGroup = standingsBySportMap.get(standing.sport_id);

    if (existingSportGroup) {
      existingSportGroup.standings.push(standing);
      return;
    }

    standingsBySportMap.set(standing.sport_id, {
      sport_id: standing.sport_id,
      sport_name: standing.sports?.name ?? "Modalidade",
      standings: [standing],
    });
  });

  return [...standingsBySportMap.values()]
    .map((sportGroup) => ({
      ...sportGroup,
      standings: sortStandingsByRanking(sportGroup.standings),
    }))
    .sort((firstSportGroup, secondSportGroup) => firstSportGroup.sport_name.localeCompare(secondSportGroup.sport_name));
}

