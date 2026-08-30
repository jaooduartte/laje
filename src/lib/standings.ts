import { type ChampionshipBracketGroupStageOption, resolveChampionshipGroupLabel } from "@/lib/championship";
import { ChampionshipThirdPlaceSource } from "@/lib/championshipPodium";
import { ChampionshipSportTieBreakerRule, type MatchNaipe, type TeamDivision } from "@/lib/enums";
import type { Match, Standing } from "@/lib/types";
import { resolveCascadeForLegacyRule, type TieBreakCriterion } from "@/lib/modalidadeConfig";

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
  blue_cards?: number;
  two_minute_penalties?: number;
}

export interface TeamStandingParticipant {
  team_id: string;
  team_name: string;
  team_city: string;
  division: TeamDivision | null;
}

export interface TeamStandingOfficialThirdPlacement {
  team_id: string;
  division: TeamDivision | null;
  source: ChampionshipThirdPlaceSource;
}

export interface TeamStandingOfficialThirdBadge {
  source: ChampionshipThirdPlaceSource;
  original_position: number;
}

export type TeamStandingOfficialThirdBadgeByTeamKey = Record<string, TeamStandingOfficialThirdBadge>;

interface RankingMetrics {
  team_id: string;
  points: number;
  wins: number;
  goal_diff: number;
  goals_for: number;
  goals_against: number;
  yellow_cards: number;
  red_cards: number;
  blue_cards?: number;
  two_minute_penalties?: number;
}

export interface TeamStandingSortOptions {
  tieBreakerRule?: ChampionshipSportTieBreakerRule;
  headToHeadMatches?: Match[];
  manualTieBreakWinnerTeamIdByPairKey?: Record<string, string>;
  participants?: readonly TeamStandingParticipant[];
}

const DEFAULT_TIE_BREAKER_RULE = ChampionshipSportTieBreakerRule.STANDARD;

export function resolveTeamStandingAggregateKey(
  standing: Pick<TeamStandingAggregate, "team_id" | "division">,
): string {
  return `${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`;
}

export function moveDisqualifiedStandingsToBottom<TStanding extends Pick<TeamStandingAggregate, "team_id" | "division">>(
  standings: TStanding[],
  disqualifiedTeamKeys?: ReadonlySet<string>,
): TStanding[] {
  if (!disqualifiedTeamKeys || disqualifiedTeamKeys.size == 0) {
    return standings;
  }

  const eligibleStandings: TStanding[] = [];
  const disqualifiedStandings: TStanding[] = [];

  standings.forEach((standing) => {
    if (disqualifiedTeamKeys.has(resolveTeamStandingAggregateKey(standing))) {
      disqualifiedStandings.push(standing);
      return;
    }

    eligibleStandings.push(standing);
  });

  return [...eligibleStandings, ...disqualifiedStandings];
}

interface CorrectedStandingPoints {
  team_id: string;
  sport_id: string;
  naipe: string;
  division: TeamDivision | string | null;
  points_base: number;
  corrected_points: number;
}

export function resolveCorrectedStandingKey(standing: {
  team_id: string;
  sport_id: string;
  naipe: string;
  division: TeamDivision | string | null;
}): string {
  return [
    standing.team_id,
    standing.sport_id,
    standing.naipe,
    standing.division ?? "WITHOUT_DIVISION",
  ].join(":");
}

export function applyCorrectedGroupPointsToStanding<TStanding extends Pick<Standing, "team_id" | "sport_id" | "naipe" | "division" | "points">>(
  standing: TStanding,
  correctedStandingByKey: Record<string, Pick<CorrectedStandingPoints, "points_base" | "corrected_points">>,
): TStanding {
  const correctedStanding = correctedStandingByKey[resolveCorrectedStandingKey(standing)];

  if (!correctedStanding) {
    return standing;
  }

  const pointsBase = Number(correctedStanding.points_base);
  const correctedPoints = Number(correctedStanding.corrected_points);

  if (!Number.isFinite(pointsBase) || !Number.isFinite(correctedPoints)) {
    return standing;
  }

  return {
    ...standing,
    points: standing.points - pointsBase + correctedPoints,
  };
}

interface ManualTieBreakContext {
  team_ids: string[];
}

function resolveTeamPairKey(firstTeamId: string, secondTeamId: string): string {
  return firstTeamId.localeCompare(secondTeamId) <= 0
    ? `${firstTeamId}|${secondTeamId}`
    : `${secondTeamId}|${firstTeamId}`;
}

function compareByManualTieBreakOrder(
  firstStanding: RankingMetrics,
  secondStanding: RankingMetrics,
  options: TeamStandingSortOptions,
): number {
  const manualTieBreakWinnerTeamIdByPairKey = options.manualTieBreakWinnerTeamIdByPairKey;

  if (!manualTieBreakWinnerTeamIdByPairKey) {
    return 0;
  }

  const teamPairKey = resolveTeamPairKey(firstStanding.team_id, secondStanding.team_id);
  const winnerTeamId = manualTieBreakWinnerTeamIdByPairKey[teamPairKey];

  if (!winnerTeamId) {
    return 0;
  }

  if (winnerTeamId == firstStanding.team_id) {
    return -1;
  }

  if (winnerTeamId == secondStanding.team_id) {
    return 1;
  }

  return 0;
}

export function resolveManualTieBreakWinnerTeamIdByPairKey(
  manualTieBreakContexts: ManualTieBreakContext[],
): Record<string, string> {
  return manualTieBreakContexts.reduce<Record<string, string>>((carry, manualTieBreakContext) => {
    for (let winnerTeamIndex = 0; winnerTeamIndex < manualTieBreakContext.team_ids.length; winnerTeamIndex += 1) {
      const winnerTeamId = manualTieBreakContext.team_ids[winnerTeamIndex];

      if (!winnerTeamId) {
        continue;
      }

      for (let loserTeamIndex = winnerTeamIndex + 1; loserTeamIndex < manualTieBreakContext.team_ids.length; loserTeamIndex += 1) {
        const loserTeamId = manualTieBreakContext.team_ids[loserTeamIndex];

        if (!loserTeamId || loserTeamId == winnerTeamId) {
          continue;
        }

        carry[resolveTeamPairKey(winnerTeamId, loserTeamId)] = winnerTeamId;
      }
    }

    return carry;
  }, {});
}

function calculatePointsAverage(goalsFor: number, goalsAgainst: number): number {
  if (goalsAgainst == 0) {
    if (goalsFor == 0) {
      return 0;
    }

    return Number.POSITIVE_INFINITY;
  }

  return goalsFor / goalsAgainst;
}

// ─── Cascade ranking (bucket-and-descend) ────────────────────────────────────

function isCriterionAscending(criterion: TieBreakCriterion): boolean {
  return (
    criterion === "GOALS_AGAINST_ASC" ||
    criterion === "YELLOW_CARDS_ASC" ||
    criterion === "RED_CARDS_ASC" ||
    criterion === "BLUE_CARDS_ASC" ||
    criterion === "TWO_MINUTE_PENALTIES_ASC"
  );
}

function resolveNumericValue(criterion: TieBreakCriterion, row: RankingMetrics): number {
  switch (criterion) {
    case "POINTS": return row.points;
    case "WINS": return row.wins;
    case "GOAL_DIFF": return row.goal_diff;
    case "GOALS_FOR": return row.goals_for;
    case "GOALS_AGAINST_ASC": return row.goals_against;
    case "YELLOW_CARDS_ASC": return row.yellow_cards;
    case "RED_CARDS_ASC": return row.red_cards;
    case "BLUE_CARDS_ASC": return row.blue_cards ?? 0;
    case "TWO_MINUTE_PENALTIES_ASC": return row.two_minute_penalties ?? 0;
    case "POINTS_AVERAGE": return calculatePointsAverage(row.goals_for, row.goals_against);
    default: return 0;
  }
}

function partitionByValue<T>(sorted: T[], getValue: (item: T) => number): T[][] {
  if (sorted.length === 0) return [];

  const partitions: T[][] = [[sorted[0]!]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = getValue(sorted[i - 1]!);
    const curr = getValue(sorted[i]!);
    const diff = Math.abs(prev - curr);

    if (diff < 1e-9 || (!Number.isFinite(prev) && !Number.isFinite(curr))) {
      partitions[partitions.length - 1]!.push(sorted[i]!);
    } else {
      partitions.push([sorted[i]!]);
    }
  }

  return partitions;
}

/**
 * Ordena `rows` usando a cascata explícita de critérios.
 * Usa abordagem bucket-and-descend:
 *   - Critérios numéricos: particionam o bucket por valor (transitivos).
 *   - HEAD_TO_HEAD com 3+ times no bucket: ignorado (evita comparador não-transitivo
 *     em ciclos triangulares). Aplicado apenas quando o bucket tem exatamente 2 times.
 *   - MANUAL_DRAW: aplicado como sorteio manual por par-chave.
 */
export function rankByCascade<T extends RankingMetrics>(
  rows: T[],
  cascade: TieBreakCriterion[],
  ctx: TeamStandingSortOptions,
  resolveName: (row: T) => string,
): T[] {
  if (rows.length <= 1) return [...rows];

  let buckets: T[][] = [[...rows]];

  for (const criterion of cascade) {
    const newBuckets: T[][] = [];

    for (const bucket of buckets) {
      if (bucket.length <= 1) {
        newBuckets.push(bucket);
        continue;
      }

      if (criterion === "HEAD_TO_HEAD") {
        if (bucket.length > 2) {
          // Ciclo de 3+ times — pular H2H (não-transitivo)
          newBuckets.push(bucket);
          continue;
        }

        // Exatamente 2 times: aplicar confronto direto
        const [a, b] = bucket as [T, T];
        const cmp = compareByDirectConfrontation(a.team_id, b.team_id, ctx.headToHeadMatches ?? []);
        if (cmp < 0) {
          newBuckets.push([a], [b]);
        } else if (cmp > 0) {
          newBuckets.push([b], [a]);
        } else {
          newBuckets.push(bucket);
        }
        continue;
      }

      if (criterion === "MANUAL_DRAW") {
        const sorted = [...bucket].sort((a, b) => {
          const cmp = compareByManualTieBreakOrder(a, b, ctx);
          if (cmp !== 0) return cmp;
          return resolveName(a).localeCompare(resolveName(b));
        });
        // Separa resolvidos dos empatados (draw order 0 = não resolvido)
        const partitions: T[][] = [];
        let current: T[] = [sorted[0]!];
        for (let i = 1; i < sorted.length; i++) {
          const prevCmp = compareByManualTieBreakOrder(sorted[i - 1]!, sorted[i]!, ctx);
          if (prevCmp === 0) {
            current.push(sorted[i]!);
          } else {
            partitions.push(current);
            current = [sorted[i]!];
          }
        }
        partitions.push(current);
        newBuckets.push(...partitions);
        continue;
      }

      // Critério numérico transitivo
      const ascending = isCriterionAscending(criterion);
      const getValue = (row: T) => resolveNumericValue(criterion, row);
      const sorted = [...bucket].sort((a, b) => {
        const va = getValue(a);
        const vb = getValue(b);
        // Trata Infinity: ambos ∞ são iguais
        if (!Number.isFinite(va) && !Number.isFinite(vb)) return 0;
        if (!Number.isFinite(va)) return ascending ? 1 : -1;
        if (!Number.isFinite(vb)) return ascending ? -1 : 1;
        return ascending ? va - vb : vb - va;
      });
      newBuckets.push(...partitionByValue(sorted, getValue));
    }

    buckets = newBuckets;
  }

  // Achata: empates restantes são ordenados alfabeticamente
  return buckets.flatMap((bucket) =>
    bucket.length <= 1 ? bucket : [...bucket].sort((a, b) => resolveName(a).localeCompare(resolveName(b))),
  );
}

// ─── PA (pontos médios) ───────────────────────────────────────────────────────

/** PA (pontos médios) = GP/GC; usado na UI da classificação. */
export function formatPointsAverageForStandings(goalsFor: number, goalsAgainst: number): string {
  const average = calculatePointsAverage(goalsFor, goalsAgainst);

  if (!Number.isFinite(average)) {
    return "∞";
  }

  return average.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatStandingsPoints(points: number): string {
  if (!Number.isFinite(points)) {
    return "0";
  }

  const normalizedPoints = Math.round(points * 10) / 10;
  const shouldShowDecimal = Math.abs(normalizedPoints % 1) > Number.EPSILON;

  return normalizedPoints.toLocaleString("pt-BR", {
    minimumFractionDigits: shouldShowDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  });
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
  options: TeamStandingSortOptions,
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

    return compareByManualTieBreakOrder(firstStanding, secondStanding, options);
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

    return compareByManualTieBreakOrder(firstStanding, secondStanding, options);
  }

  if (tieBreakerRule == ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY) {
    if (compareDirectConfrontation != 0) {
      return compareDirectConfrontation;
    }

    if (firstStanding.goal_diff != secondStanding.goal_diff) {
      return secondStanding.goal_diff - firstStanding.goal_diff;
    }

    if (firstStanding.goals_for != secondStanding.goals_for) {
      return secondStanding.goals_for - firstStanding.goals_for;
    }

    if (firstStanding.yellow_cards != secondStanding.yellow_cards) {
      return firstStanding.yellow_cards - secondStanding.yellow_cards;
    }

    if (firstStanding.red_cards != secondStanding.red_cards) {
      return firstStanding.red_cards - secondStanding.red_cards;
    }

    return compareByManualTieBreakOrder(firstStanding, secondStanding, options);
  }

  if (tieBreakerRule == ChampionshipSportTieBreakerRule.HANDEBOL) {
    if (compareDirectConfrontation != 0) {
      return compareDirectConfrontation;
    }

    if (firstStanding.goal_diff != secondStanding.goal_diff) {
      return secondStanding.goal_diff - firstStanding.goal_diff;
    }

    if (firstStanding.goals_for != secondStanding.goals_for) {
      return secondStanding.goals_for - firstStanding.goals_for;
    }

    if ((firstStanding.blue_cards ?? 0) != (secondStanding.blue_cards ?? 0)) {
      return (firstStanding.blue_cards ?? 0) - (secondStanding.blue_cards ?? 0);
    }

    if ((firstStanding.two_minute_penalties ?? 0) != (secondStanding.two_minute_penalties ?? 0)) {
      return (firstStanding.two_minute_penalties ?? 0) - (secondStanding.two_minute_penalties ?? 0);
    }

    return compareByManualTieBreakOrder(firstStanding, secondStanding, options);
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

    return compareByManualTieBreakOrder(firstStanding, secondStanding, options);
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

  return compareByManualTieBreakOrder(firstStanding, secondStanding, options);
}

function resolveStandingTeamName(standing: Standing): string {
  return standing.teams?.name ?? "Atlética";
}

function resolveStandingTeamCity(standing: Standing): string {
  return standing.teams?.city ?? "";
}

export function sortStandingsByRanking(standings: Standing[], options: TeamStandingSortOptions = {}): Standing[] {
  const tieBreakerRule = options.tieBreakerRule ?? DEFAULT_TIE_BREAKER_RULE;
  const cascade = resolveCascadeForLegacyRule(tieBreakerRule);

  return rankByCascade(standings, cascade, options, resolveStandingTeamName);
}

export function aggregateStandingsByTeam(
  standings: Standing[],
  options: TeamStandingSortOptions = {},
): TeamStandingAggregate[] {
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
      existingTeamStanding.blue_cards += standing.blue_cards ?? 0;
      existingTeamStanding.two_minute_penalties += standing.two_minute_penalties ?? 0;
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
      blue_cards: standing.blue_cards ?? 0,
      two_minute_penalties: standing.two_minute_penalties ?? 0,
    });
  });

  options.participants?.forEach((participant) => {
    const teamStandingKey = resolveTeamStandingAggregateKey(participant);

    if (teamStandingMap.has(teamStandingKey)) {
      return;
    }

    teamStandingMap.set(teamStandingKey, {
      team_id: participant.team_id,
      team_name: participant.team_name,
      team_city: participant.team_city,
      division: participant.division,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_diff: 0,
      points: 0,
      yellow_cards: 0,
      red_cards: 0,
      blue_cards: 0,
      two_minute_penalties: 0,
    });
  });

  return sortTeamStandingAggregatesByRanking([...teamStandingMap.values()], options);
}

export function completeTeamStandingAggregates(
  standings: TeamStandingAggregate[],
  participants: readonly TeamStandingParticipant[],
  options: TeamStandingSortOptions = {},
): TeamStandingAggregate[] {
  const standingsByTeamKey = new Map(
    standings.map((standing) => [resolveTeamStandingAggregateKey(standing), standing]),
  );

  participants.forEach((participant) => {
    const teamStandingKey = resolveTeamStandingAggregateKey(participant);

    if (standingsByTeamKey.has(teamStandingKey)) {
      return;
    }

    standingsByTeamKey.set(teamStandingKey, {
      team_id: participant.team_id,
      team_name: participant.team_name,
      team_city: participant.team_city,
      division: participant.division,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_diff: 0,
      points: 0,
      yellow_cards: 0,
      red_cards: 0,
      blue_cards: 0,
      two_minute_penalties: 0,
    });
  });

  return sortTeamStandingAggregatesByRanking(
    [...standingsByTeamKey.values()],
    options,
  );
}

export function applyOfficialThirdPlacementToStandings(
  standings: TeamStandingAggregate[],
  placements: TeamStandingOfficialThirdPlacement[],
): {
  adjustedStandings: TeamStandingAggregate[];
  badgeByTeamKey: TeamStandingOfficialThirdBadgeByTeamKey;
} {
  if (standings.length == 0 || placements.length == 0) {
    return {
      adjustedStandings: standings,
      badgeByTeamKey: {},
    };
  }

  const adjustedStandings = [...standings];
  const badgeByTeamKey: TeamStandingOfficialThirdBadgeByTeamKey = {};
  const targetIndex = Math.min(2, adjustedStandings.length - 1);

  if (targetIndex < 0) {
    return {
      adjustedStandings,
      badgeByTeamKey,
    };
  }

  placements.forEach((placement) => {
    const teamKey = resolveTeamStandingAggregateKey(placement);
    const currentIndex = adjustedStandings.findIndex((standing) => {
      return resolveTeamStandingAggregateKey(standing) == teamKey;
    });

    if (currentIndex < 0 || currentIndex == targetIndex) {
      return;
    }

    const [teamToReposition] = adjustedStandings.splice(currentIndex, 1);

    if (!teamToReposition) {
      return;
    }

    adjustedStandings.splice(targetIndex, 0, teamToReposition);
    badgeByTeamKey[teamKey] = {
      source: placement.source,
      original_position: currentIndex + 1,
    };
  });

  return {
    adjustedStandings,
    badgeByTeamKey,
  };
}

export type BracketGroupPlacementFilter = "all" | "first_per_group" | "second_per_group";

export function sortTeamStandingAggregatesByRanking(
  aggregates: TeamStandingAggregate[],
  options: TeamStandingSortOptions = {},
): TeamStandingAggregate[] {
  const tieBreakerRule = options.tieBreakerRule ?? DEFAULT_TIE_BREAKER_RULE;
  const cascade = resolveCascadeForLegacyRule(tieBreakerRule);

  return rankByCascade(aggregates, cascade, options, (row) => row.team_name);
}

export interface BracketGroupPlacementFilterContext {
  groupOptions: ChampionshipBracketGroupStageOption[];
  placement: BracketGroupPlacementFilter;
  groupSelectValue: string;
  allGroupSelectValue: string;
  sportSelectValue: string;
  allSportSelectValue: string;
  naipeSelectValue: string;
  allNaipeSelectValue: string;
  sortOptions: TeamStandingSortOptions;
  resolveTieBreakerRuleForSport: (sportId: string) => ChampionshipSportTieBreakerRule;
  finalTieBreakerRule: ChampionshipSportTieBreakerRule;
  pinnedBottomTeamKeys?: ReadonlySet<string>;
}

export function filterAggregatesByBracketGroupPlacement(
  aggregates: TeamStandingAggregate[],
  context: BracketGroupPlacementFilterContext,
): TeamStandingAggregate[] {
  const matchesSportAndNaipe = (group: ChampionshipBracketGroupStageOption) => {
    if (context.sportSelectValue != context.allSportSelectValue && group.sport_id != context.sportSelectValue) {
      return false;
    }

    if (context.naipeSelectValue != context.allNaipeSelectValue && group.naipe != context.naipeSelectValue) {
      return false;
    }

    return true;
  };

  let groupsToScan = context.groupOptions.filter(matchesSportAndNaipe);

  if (context.groupSelectValue != context.allGroupSelectValue) {
    groupsToScan = groupsToScan.filter(
      (groupOption) =>
        groupOption.value === context.groupSelectValue ||
        resolveChampionshipGroupLabel(groupOption.group_number) === context.groupSelectValue,
    );
  }

  if (context.placement == "all") {
    if (context.groupSelectValue == context.allGroupSelectValue) {
      return aggregates;
    }

    if (groupsToScan.length == 0) {
      return [];
    }

    const allowedTeamIds = new Set(groupsToScan.flatMap((groupOption) => groupOption.team_ids));
    const filteredAggregates = aggregates.filter((aggregateRow) => allowedTeamIds.has(aggregateRow.team_id));

    return moveDisqualifiedStandingsToBottom(
      sortTeamStandingAggregatesByRanking(filteredAggregates, {
        ...context.sortOptions,
        tieBreakerRule: context.finalTieBreakerRule,
      }),
      context.pinnedBottomTeamKeys,
    );
  }

  if (context.groupOptions.length == 0) {
    return aggregates;
  }

  const rankIndex = context.placement == "first_per_group" ? 0 : 1;

  const picked: TeamStandingAggregate[] = [];
  const seen = new Set<string>();

  for (const group of groupsToScan) {
    const inGroup = aggregates.filter((aggregateRow) => group.team_ids.includes(aggregateRow.team_id));

    if (inGroup.length == 0) {
      continue;
    }

    const sorted = moveDisqualifiedStandingsToBottom(
      sortTeamStandingAggregatesByRanking(inGroup, {
        ...context.sortOptions,
        tieBreakerRule: context.resolveTieBreakerRuleForSport(group.sport_id),
      }),
      context.pinnedBottomTeamKeys,
    );

    const pick = sorted[rankIndex];

    if (!pick) {
      continue;
    }

    const dedupeKey = `${pick.team_id}:${pick.division ?? "WITHOUT_DIVISION"}`;

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      picked.push(pick);
    }
  }

  return moveDisqualifiedStandingsToBottom(
    sortTeamStandingAggregatesByRanking(picked, {
      ...context.sortOptions,
      tieBreakerRule: context.finalTieBreakerRule,
    }),
    context.pinnedBottomTeamKeys,
  );
}

export function aggregateStandingsByNaipe(
  standings: Standing[],
  naipe: MatchNaipe,
  options: TeamStandingSortOptions = {},
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
