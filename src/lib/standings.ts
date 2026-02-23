import { ChampionshipSportTieBreakerRule, type MatchNaipe, type TeamDivision } from "@/lib/enums";
import type { Match, Standing } from "@/lib/types";

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
  yellow_cards: number;
  red_cards: number;
}

interface RankingMetrics {
  team_id: string;
  points: number;
  wins: number;
  goal_diff: number;
  goals_for: number;
  goals_against: number;
  yellow_cards: number;
  red_cards: number;
}

interface SortStandingsOptions {
  tieBreakerRule?: ChampionshipSportTieBreakerRule;
  headToHeadMatches?: Match[];
}

const DEFAULT_TIE_BREAKER_RULE = ChampionshipSportTieBreakerRule.STANDARD;

function calculatePointsAverage(goalsFor: number, goalsAgainst: number): number {
  if (goalsAgainst == 0) {
    if (goalsFor == 0) {
      return 0;
    }

    return Number.POSITIVE_INFINITY;
  }

  return goalsFor / goalsAgainst;
}

function compareByDirectConfrontation(
  firstTeamId: string,
  secondTeamId: string,
  headToHeadMatches: Match[],
): number {
  let firstTeamPoints = 0;
  let secondTeamPoints = 0;
  let firstTeamGoals = 0;
  let secondTeamGoals = 0;
  let hasDirectConfrontation = false;

  headToHeadMatches.forEach((match) => {
    const isDirectConfrontation =
      (match.home_team_id == firstTeamId && match.away_team_id == secondTeamId) ||
      (match.home_team_id == secondTeamId && match.away_team_id == firstTeamId);

    if (!isDirectConfrontation) {
      return;
    }

    hasDirectConfrontation = true;

    const firstTeamIsHome = match.home_team_id == firstTeamId;
    const firstTeamScore = firstTeamIsHome ? match.home_score : match.away_score;
    const secondTeamScore = firstTeamIsHome ? match.away_score : match.home_score;

    firstTeamGoals += firstTeamScore;
    secondTeamGoals += secondTeamScore;

    if (firstTeamScore > secondTeamScore) {
      firstTeamPoints += 3;
      return;
    }

    if (firstTeamScore < secondTeamScore) {
      secondTeamPoints += 3;
      return;
    }

    firstTeamPoints += 1;
    secondTeamPoints += 1;
  });

  if (!hasDirectConfrontation) {
    return 0;
  }

  if (firstTeamPoints != secondTeamPoints) {
    return secondTeamPoints - firstTeamPoints;
  }

  if (firstTeamGoals != secondTeamGoals) {
    return secondTeamGoals - firstTeamGoals;
  }

  return 0;
}

function compareByRule(
  firstStanding: RankingMetrics,
  secondStanding: RankingMetrics,
  tieBreakerRule: ChampionshipSportTieBreakerRule,
  options: SortStandingsOptions,
): number {
  const headToHeadMatches = options.headToHeadMatches ?? [];
  const compareDirectConfrontation = compareByDirectConfrontation(
    firstStanding.team_id,
    secondStanding.team_id,
    headToHeadMatches,
  );

  if (firstStanding.points != secondStanding.points) {
    return secondStanding.points - firstStanding.points;
  }

  if (tieBreakerRule == ChampionshipSportTieBreakerRule.POINTS_AVERAGE && compareDirectConfrontation != 0) {
    return compareDirectConfrontation;
  }

  if (tieBreakerRule == ChampionshipSportTieBreakerRule.BEACH_SOCCER) {
    if (compareDirectConfrontation != 0) {
      return compareDirectConfrontation;
    }

    if (firstStanding.wins != secondStanding.wins) {
      return secondStanding.wins - firstStanding.wins;
    }

    if (firstStanding.goal_diff != secondStanding.goal_diff) {
      return secondStanding.goal_diff - firstStanding.goal_diff;
    }

    if (firstStanding.goals_for != secondStanding.goals_for) {
      return secondStanding.goals_for - firstStanding.goals_for;
    }

    if (firstStanding.goals_against != secondStanding.goals_against) {
      return firstStanding.goals_against - secondStanding.goals_against;
    }

    if (firstStanding.yellow_cards != secondStanding.yellow_cards) {
      return firstStanding.yellow_cards - secondStanding.yellow_cards;
    }

    if (firstStanding.red_cards != secondStanding.red_cards) {
      return firstStanding.red_cards - secondStanding.red_cards;
    }

    return 0;
  }

  if (tieBreakerRule == ChampionshipSportTieBreakerRule.BEACH_TENNIS) {
    if (firstStanding.wins != secondStanding.wins) {
      return secondStanding.wins - firstStanding.wins;
    }

    if (compareDirectConfrontation != 0) {
      return compareDirectConfrontation;
    }

    if (firstStanding.goal_diff != secondStanding.goal_diff) {
      return secondStanding.goal_diff - firstStanding.goal_diff;
    }

    if (firstStanding.goals_for != secondStanding.goals_for) {
      return secondStanding.goals_for - firstStanding.goals_for;
    }

    return 0;
  }

  if (tieBreakerRule == ChampionshipSportTieBreakerRule.POINTS_AVERAGE) {
    const firstPointsAverage = calculatePointsAverage(firstStanding.goals_for, firstStanding.goals_against);
    const secondPointsAverage = calculatePointsAverage(secondStanding.goals_for, secondStanding.goals_against);

    if (firstPointsAverage != secondPointsAverage) {
      return secondPointsAverage - firstPointsAverage;
    }

    if (firstStanding.goal_diff != secondStanding.goal_diff) {
      return secondStanding.goal_diff - firstStanding.goal_diff;
    }

    if (firstStanding.goals_for != secondStanding.goals_for) {
      return secondStanding.goals_for - firstStanding.goals_for;
    }

    if (firstStanding.wins != secondStanding.wins) {
      return secondStanding.wins - firstStanding.wins;
    }

    return 0;
  }

  if (firstStanding.goal_diff != secondStanding.goal_diff) {
    return secondStanding.goal_diff - firstStanding.goal_diff;
  }

  if (firstStanding.goals_for != secondStanding.goals_for) {
    return secondStanding.goals_for - firstStanding.goals_for;
  }

  if (firstStanding.wins != secondStanding.wins) {
    return secondStanding.wins - firstStanding.wins;
  }

  if (firstStanding.yellow_cards != secondStanding.yellow_cards) {
    return firstStanding.yellow_cards - secondStanding.yellow_cards;
  }

  if (firstStanding.red_cards != secondStanding.red_cards) {
    return firstStanding.red_cards - secondStanding.red_cards;
  }

  return 0;
}

function resolveStandingTeamName(standing: Standing): string {
  return standing.teams?.name ?? "Atlética";
}

function resolveStandingTeamCity(standing: Standing): string {
  return standing.teams?.city ?? "";
}

export function sortStandingsByRanking(standings: Standing[], options: SortStandingsOptions = {}): Standing[] {
  const tieBreakerRule = options.tieBreakerRule ?? DEFAULT_TIE_BREAKER_RULE;

  return [...standings].sort((firstStanding, secondStanding) => {
    const compareByTieBreakerRule = compareByRule(
      firstStanding,
      secondStanding,
      tieBreakerRule,
      options,
    );

    if (compareByTieBreakerRule != 0) {
      return compareByTieBreakerRule;
    }

    return resolveStandingTeamName(firstStanding).localeCompare(resolveStandingTeamName(secondStanding));
  });
}

export function aggregateStandingsByTeam(
  standings: Standing[],
  options: SortStandingsOptions = {},
): TeamStandingAggregate[] {
  const tieBreakerRule = options.tieBreakerRule ?? DEFAULT_TIE_BREAKER_RULE;
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
      existingTeamStanding.yellow_cards += standing.yellow_cards;
      existingTeamStanding.red_cards += standing.red_cards;
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
      yellow_cards: standing.yellow_cards,
      red_cards: standing.red_cards,
    });
  });

  return [...teamStandingMap.values()].sort((firstTeamStanding, secondTeamStanding) => {
    const compareByTieBreakerRule = compareByRule(
      firstTeamStanding,
      secondTeamStanding,
      tieBreakerRule,
      options,
    );

    if (compareByTieBreakerRule != 0) {
      return compareByTieBreakerRule;
    }

    return firstTeamStanding.team_name.localeCompare(secondTeamStanding.team_name);
  });
}

export function aggregateStandingsByNaipe(
  standings: Standing[],
  naipe: MatchNaipe,
  options: SortStandingsOptions = {},
): TeamStandingAggregate[] {
  const standingsForNaipe = standings.filter((standing) => standing.naipe === naipe);
  return aggregateStandingsByTeam(standingsForNaipe, options);
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
