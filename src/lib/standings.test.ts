import { describe, expect, it } from "vitest";
import { ChampionshipSportTieBreakerRule, MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import { ChampionshipThirdPlaceSource } from "@/lib/championshipPodium";
import type { Match, Standing } from "@/lib/types";
import {
  applyOfficialThirdPlacementToStandings,
  aggregateStandingsByTeam,
  applyCorrectedGroupPointsToStanding,
  filterAggregatesByBracketGroupPlacement,
  formatPointsAverageForStandings,
  formatStandingsPoints,
  resolveManualTieBreakWinnerTeamIdByPairKey,
  sortTeamStandingAggregatesByRanking,
  type TeamStandingAggregate,
} from "@/lib/standings";

function buildStanding(overrides: Partial<Standing> & Pick<Standing, "id" | "team_id">): Standing {
  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    sport_id: overrides.sport_id ?? "sport-1",
    team_id: overrides.team_id,
    played: overrides.played ?? 2,
    wins: overrides.wins ?? 1,
    draws: overrides.draws ?? 1,
    losses: overrides.losses ?? 0,
    goals_for: overrides.goals_for ?? 4,
    goals_against: overrides.goals_against ?? 2,
    goal_diff: overrides.goal_diff ?? 2,
    points: overrides.points ?? 4,
    yellow_cards: overrides.yellow_cards ?? 0,
    red_cards: overrides.red_cards ?? 0,
    updated_at: overrides.updated_at ?? "2026-04-11T10:00:00.000Z",
    championships: overrides.championships,
    teams: overrides.teams ?? {
      id: overrides.team_id,
      name: `Atlética ${overrides.team_id}`,
      city: "Joinville",
      division: TeamDivision.DIVISAO_PRINCIPAL,
      created_at: "2026-03-01T00:00:00.000Z",
    },
    sports: overrides.sports,
  };
}

describe("standings manual tie-break", () => {
  it("aplica ordem manual quando critérios automáticos empatam totalmente", () => {
    const standings = [
      buildStanding({
        id: "standing-alpha",
        team_id: "team-alpha",
        teams: {
          id: "team-alpha",
          name: "Alpha",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      }),
      buildStanding({
        id: "standing-beta",
        team_id: "team-beta",
        teams: {
          id: "team-beta",
          name: "Beta",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      }),
    ];

    const manualTieBreakWinnerTeamIdByPairKey = resolveManualTieBreakWinnerTeamIdByPairKey([
      { team_ids: ["team-beta", "team-alpha"] },
    ]);

    const sortedStandings = aggregateStandingsByTeam(standings, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
      manualTieBreakWinnerTeamIdByPairKey,
    });

    expect(sortedStandings[0]?.team_id).toBe("team-beta");
  });

  it("mantém fallback atual quando não existe desempate manual", () => {
    const standings = [
      buildStanding({
        id: "standing-alpha",
        team_id: "team-alpha",
        teams: {
          id: "team-alpha",
          name: "Alpha",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      }),
      buildStanding({
        id: "standing-beta",
        team_id: "team-beta",
        teams: {
          id: "team-beta",
          name: "Beta",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      }),
    ];

    const sortedStandings = aggregateStandingsByTeam(standings, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
    });

    expect(sortedStandings[0]?.team_id).toBe("team-alpha");
  });

  it("não sobrescreve critérios automáticos quando já há desempate antes do último critério", () => {
    const standings = [
      buildStanding({
        id: "standing-alpha",
        team_id: "team-alpha",
        goals_for: 8,
        goal_diff: 5,
        teams: {
          id: "team-alpha",
          name: "Alpha",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      }),
      buildStanding({
        id: "standing-beta",
        team_id: "team-beta",
        goals_for: 2,
        goal_diff: 1,
        teams: {
          id: "team-beta",
          name: "Beta",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      }),
    ];

    const manualTieBreakWinnerTeamIdByPairKey = resolveManualTieBreakWinnerTeamIdByPairKey([
      { team_ids: ["team-beta", "team-alpha"] },
    ]);

    const sortedStandings = aggregateStandingsByTeam(standings, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
      manualTieBreakWinnerTeamIdByPairKey,
    });

    expect(sortedStandings[0]?.team_id).toBe("team-alpha");
  });
});

describe("formatPointsAverageForStandings", () => {
  it("formata GP/GC com duas casas e trata GC zero", () => {
    expect(formatPointsAverageForStandings(36, 7)).toMatch(/5,[0-9]{2}/);
    expect(formatPointsAverageForStandings(0, 0)).toBe("0,00");
    expect(formatPointsAverageForStandings(10, 0)).toBe("∞");
  });
});

describe("formatStandingsPoints", () => {
  it("formata sem ,0 e mantém uma casa apenas quando necessário", () => {
    expect(formatStandingsPoints(9)).toBe("9");
    expect(formatStandingsPoints(4.5)).toBe("4,5");
    expect(formatStandingsPoints(0)).toBe("0");
  });
});

describe("applyOfficialThirdPlacementToStandings", () => {
  it("reposiciona a equipe para 3º e retorna badge quando ela não estava em 3º", () => {
    const standings = [
      buildAggregate({ team_id: "team-1", team_name: "Team 1", points: 12 }),
      buildAggregate({ team_id: "team-2", team_name: "Team 2", points: 11 }),
      buildAggregate({ team_id: "team-3", team_name: "Team 3", points: 10 }),
      buildAggregate({ team_id: "team-4", team_name: "Team 4", points: 9 }),
    ];

    const result = applyOfficialThirdPlacementToStandings(standings, [
      {
        team_id: "team-4",
        division: null,
        source: ChampionshipThirdPlaceSource.CHAMPION_SEMIFINAL_LOSER,
      },
    ]);

    expect(result.adjustedStandings.map((standing) => standing.team_id)).toEqual([
      "team-1",
      "team-2",
      "team-4",
      "team-3",
    ]);
    expect(result.badgeByTeamKey["team-4:WITHOUT_DIVISION"]).toMatchObject({
      source: ChampionshipThirdPlaceSource.CHAMPION_SEMIFINAL_LOSER,
      original_position: 4,
    });
  });

  it("não retorna badge quando a equipe oficial já está em 3º", () => {
    const standings = [
      buildAggregate({ team_id: "team-1", team_name: "Team 1", points: 12 }),
      buildAggregate({ team_id: "team-2", team_name: "Team 2", points: 11 }),
      buildAggregate({ team_id: "team-3", team_name: "Team 3", points: 10 }),
    ];

    const result = applyOfficialThirdPlacementToStandings(standings, [
      {
        team_id: "team-3",
        division: null,
        source: ChampionshipThirdPlaceSource.THIRD_PLACE_MATCH,
      },
    ]);

    expect(result.adjustedStandings.map((standing) => standing.team_id)).toEqual(["team-1", "team-2", "team-3"]);
    expect(result.badgeByTeamKey["team-3:WITHOUT_DIVISION"]).toBeUndefined();
  });
});

describe("applyCorrectedGroupPointsToStanding", () => {
  it("substitui apenas a parcela de pontos da fase de grupos pela pontuação corrigida", () => {
    const standing = buildStanding({
      id: "standing-corrected",
      team_id: "team-corrected",
      sport_id: "sport-corrected",
      points: 12,
    });

    const adjustedStanding = applyCorrectedGroupPointsToStanding(standing, {
      "team-corrected:sport-corrected:MASCULINO:DIVISAO_PRINCIPAL": {
        points_base: 6,
        corrected_points: 9,
      },
    });

    expect(adjustedStanding.points).toBe(15);
  });

  it("preserva pontos de mata-mata quando há pontuação corrigida de grupos", () => {
    const standing = buildStanding({
      id: "standing-knockout-points",
      team_id: "team-knockout-points",
      sport_id: "sport-corrected",
      points: 18,
    });

    const adjustedStanding = applyCorrectedGroupPointsToStanding(standing, {
      "team-knockout-points:sport-corrected:MASCULINO:DIVISAO_PRINCIPAL": {
        points_base: 6,
        corrected_points: 9,
      },
    });

    expect(adjustedStanding.points).toBe(21);
  });

  it("mantém pontuação original quando não existe correção", () => {
    const standing = buildStanding({
      id: "standing-without-correction",
      team_id: "team-without-correction",
      sport_id: "sport-without-correction",
      points: 12,
    });

    const adjustedStanding = applyCorrectedGroupPointsToStanding(standing, {});

    expect(adjustedStanding.points).toBe(12);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildAggregate(
  overrides: Partial<TeamStandingAggregate> & Pick<TeamStandingAggregate, "team_id" | "team_name">,
): TeamStandingAggregate {
  return {
    team_id: overrides.team_id,
    team_name: overrides.team_name,
    team_city: overrides.team_city ?? "",
    division: overrides.division ?? null,
    played: overrides.played ?? 3,
    wins: overrides.wins ?? 2,
    draws: overrides.draws ?? 0,
    losses: overrides.losses ?? 1,
    goals_for: overrides.goals_for ?? 6,
    goals_against: overrides.goals_against ?? 3,
    goal_diff: overrides.goal_diff ?? 3,
    points: overrides.points ?? 6,
    yellow_cards: overrides.yellow_cards ?? 0,
    red_cards: overrides.red_cards ?? 0,
  };
}

function buildMatch(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): Match {
  return {
    id: `match-${homeTeamId}-vs-${awayTeamId}`,
    championship_id: "championship-1",
    season_year: 2026,
    division: null,
    naipe: MatchNaipe.MASCULINO,
    supports_cards: false,
    sport_id: "sport-1",
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    location: "Quadra",
    court_name: null,
    scheduled_date: null,
    queue_position: null,
    start_time: null,
    end_time: null,
    status: MatchStatus.FINISHED,
    home_score: homeScore,
    home_yellow_cards: 0,
    home_red_cards: 0,
    away_score: awayScore,
    away_yellow_cards: 0,
    away_red_cards: 0,
    created_at: "2026-04-01T10:00:00.000Z",
  };
}

// ─── rankByCascade (via sortTeamStandingAggregatesByRanking) ─────────────────

describe("sortTeamStandingAggregatesByRanking — ciclo triangular", () => {
  // A vence B, B vence C, C vence A → ciclo de 3 times.
  // H2H NÃO deve ser aplicado no bucket de 3; desempate deve cair para goal_diff.
  const headToHeadMatches: Match[] = [
    buildMatch("team-a", "team-b", 2, 0), // A vence B
    buildMatch("team-b", "team-c", 2, 0), // B vence C
    buildMatch("team-c", "team-a", 2, 0), // C vence A
  ];

  const aggregates: TeamStandingAggregate[] = [
    buildAggregate({ team_id: "team-a", team_name: "A", points: 6, wins: 2, goal_diff: 3, goals_for: 6, goals_against: 3, yellow_cards: 0, red_cards: 0 }),
    buildAggregate({ team_id: "team-b", team_name: "B", points: 6, wins: 2, goal_diff: 2, goals_for: 5, goals_against: 3, yellow_cards: 0, red_cards: 0 }),
    buildAggregate({ team_id: "team-c", team_name: "C", points: 6, wins: 2, goal_diff: 1, goals_for: 4, goals_against: 3, yellow_cards: 0, red_cards: 0 }),
  ];

  it("ordena por goal_diff quando H2H forma ciclo de 3 (BEACH_SOCCER)", () => {
    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
      headToHeadMatches,
    });

    expect(result.map((r) => r.team_id)).toEqual(["team-a", "team-b", "team-c"]);
  });

  it("ordena por goal_diff quando H2H forma ciclo de 3 (POINTS_AVERAGE sem PA diferente)", () => {
    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
      headToHeadMatches,
    });

    // PA = goals_for / goals_against: A=2.0, B=1.67, C=1.33 → mesma ordem que goal_diff neste caso
    expect(result[0]?.team_id).toBe("team-a");
  });
});

describe("sortTeamStandingAggregatesByRanking — confronto direto (H2H) de 2 times", () => {
  it("aplica H2H quando exatamente 2 times estão empatados e jogaram entre si", () => {
    const aggregates: TeamStandingAggregate[] = [
      buildAggregate({ team_id: "team-a", team_name: "A", points: 3, wins: 1, goal_diff: 0, goals_for: 3, goals_against: 3 }),
      buildAggregate({ team_id: "team-b", team_name: "B", points: 3, wins: 1, goal_diff: 0, goals_for: 3, goals_against: 3 }),
    ];

    // A venceu B no confronto direto
    const headToHeadMatches: Match[] = [buildMatch("team-a", "team-b", 2, 1)];

    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
      headToHeadMatches,
    });

    expect(result[0]?.team_id).toBe("team-a");
    expect(result[1]?.team_id).toBe("team-b");
  });

  it("cai para próximo critério quando não há confronto direto entre os 2 times", () => {
    const aggregates: TeamStandingAggregate[] = [
      buildAggregate({ team_id: "team-a", team_name: "A", points: 3, wins: 2, goal_diff: 0, goals_for: 3, goals_against: 3 }),
      buildAggregate({ team_id: "team-b", team_name: "B", points: 3, wins: 1, goal_diff: 0, goals_for: 3, goals_against: 3 }),
    ];

    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
      headToHeadMatches: [], // sem confronto
    });

    // BEACH_SOCCER cascade: POINTS → H2H(sem jogo → 0) → WINS → ...
    expect(result[0]?.team_id).toBe("team-a"); // mais vitórias
  });
});

describe("sortTeamStandingAggregatesByRanking — cascatas por modalidade", () => {
  it("Beach Soccer desempata por cartões quando tudo mais é igual", () => {
    const aggregates: TeamStandingAggregate[] = [
      buildAggregate({ team_id: "team-a", team_name: "A", points: 6, wins: 2, goal_diff: 3, goals_for: 6, goals_against: 3, yellow_cards: 2, red_cards: 0 }),
      buildAggregate({ team_id: "team-b", team_name: "B", points: 6, wins: 2, goal_diff: 3, goals_for: 6, goals_against: 3, yellow_cards: 0, red_cards: 0 }),
    ];

    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
      headToHeadMatches: [],
    });

    expect(result[0]?.team_id).toBe("team-b"); // menos cartões amarelos
  });

  it("Pontos Médios (Futevôlei/Vôlei) desempata por PA antes de goal_diff", () => {
    // A: goal_diff maior, mas PA menor
    // B: goal_diff menor, mas PA maior
    const aggregates: TeamStandingAggregate[] = [
      buildAggregate({ team_id: "team-a", team_name: "A", points: 6, wins: 2, goal_diff: 4, goals_for: 6, goals_against: 2 }), // PA = 3.0
      buildAggregate({ team_id: "team-b", team_name: "B", points: 6, wins: 2, goal_diff: 3, goals_for: 4, goals_against: 1 }), // PA = 4.0
    ];

    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
      headToHeadMatches: [],
    });

    expect(result[0]?.team_id).toBe("team-b"); // PA 4.0 > 3.0, mesmo com goal_diff menor
  });

  it("Beach Soccer desempata por goal_diff (não usa PA)", () => {
    // Mesmos dados: A tem goal_diff maior; B tem PA maior
    const aggregates: TeamStandingAggregate[] = [
      buildAggregate({ team_id: "team-a", team_name: "A", points: 6, wins: 2, goal_diff: 4, goals_for: 6, goals_against: 2 }), // PA = 3.0
      buildAggregate({ team_id: "team-b", team_name: "B", points: 6, wins: 2, goal_diff: 3, goals_for: 4, goals_against: 1 }), // PA = 4.0
    ];

    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
      headToHeadMatches: [],
    });

    expect(result[0]?.team_id).toBe("team-a"); // goal_diff 4 > 3 (PA não entra na cascata do Beach Soccer)
  });

  it("Beach Tennis desempata por vitórias antes de H2H", () => {
    const aggregates: TeamStandingAggregate[] = [
      buildAggregate({ team_id: "team-a", team_name: "A", points: 4, wins: 1, draws: 1, goal_diff: 2, goals_for: 5 }),
      buildAggregate({ team_id: "team-b", team_name: "B", points: 4, wins: 2, draws: 0, goal_diff: 1, goals_for: 4 }),
    ];

    // B venceu A no confronto direto — mas BEACH_TENNIS usa WINS antes de H2H
    const headToHeadMatches: Match[] = [buildMatch("team-b", "team-a", 2, 1)];

    const result = sortTeamStandingAggregatesByRanking(aggregates, {
      tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_TENNIS,
      headToHeadMatches,
    });

    expect(result[0]?.team_id).toBe("team-b"); // mais vitórias, H2H nem chega a ser avaliado
  });
});

describe("filterAggregatesByBracketGroupPlacement", () => {
  const baseSortOptions = {
    tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
    headToHeadMatches: [] as never[],
    manualTieBreakWinnerTeamIdByPairKey: undefined,
  };

  const mockGroup = {
    value: "comp:g1",
    competition_id: "comp",
    group_id: "g1",
    group_number: 1,
    sport_id: "sport-1",
    sport_name: "Teste",
    naipe: MatchNaipe.MASCULINO,
    division: TeamDivision.DIVISAO_PRINCIPAL,
    label: "Grupo A",
    team_ids: ["t1", "t2"],
  };

  it("com placement all devolve a mesma lista", () => {
    const agg = [
      { team_id: "t1", team_name: "A", team_city: "", division: null, played: 1, wins: 1, draws: 0, losses: 0, goals_for: 1, goals_against: 0, goal_diff: 1, points: 3, yellow_cards: 0, red_cards: 0 },
    ];
    const out = filterAggregatesByBracketGroupPlacement(agg, {
      groupOptions: [mockGroup],
      placement: "all",
      groupSelectValue: "ALL",
      allGroupSelectValue: "ALL",
      sportSelectValue: "ALL",
      allSportSelectValue: "ALL",
      naipeSelectValue: "ALL",
      allNaipeSelectValue: "ALL",
      sortOptions: baseSortOptions,
      resolveTieBreakerRuleForSport: () => ChampionshipSportTieBreakerRule.STANDARD,
      finalTieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
    });
    expect(out).toEqual(agg);
  });

  it("com placement all e grupo selecionado filtra apenas times do grupo", () => {
    const agg = [
      { team_id: "t1", team_name: "A", team_city: "", division: null, played: 1, wins: 1, draws: 0, losses: 0, goals_for: 1, goals_against: 0, goal_diff: 1, points: 3, yellow_cards: 0, red_cards: 0 },
      { team_id: "t2", team_name: "B", team_city: "", division: null, played: 1, wins: 0, draws: 0, losses: 1, goals_for: 0, goals_against: 1, goal_diff: -1, points: 0, yellow_cards: 0, red_cards: 0 },
      { team_id: "t3", team_name: "C", team_city: "", division: null, played: 1, wins: 0, draws: 1, losses: 0, goals_for: 1, goals_against: 1, goal_diff: 0, points: 1, yellow_cards: 0, red_cards: 0 },
    ];
    const out = filterAggregatesByBracketGroupPlacement(agg, {
      groupOptions: [mockGroup],
      placement: "all",
      groupSelectValue: "Grupo A",
      allGroupSelectValue: "ALL",
      sportSelectValue: "sport-1",
      allSportSelectValue: "ALL",
      naipeSelectValue: MatchNaipe.MASCULINO,
      allNaipeSelectValue: "ALL",
      sortOptions: baseSortOptions,
      resolveTieBreakerRuleForSport: () => ChampionshipSportTieBreakerRule.STANDARD,
      finalTieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
    });
    expect(out).toHaveLength(2);
    expect(out.map((team) => team.team_id)).toEqual(["t1", "t2"]);
  });

  it("seleciona primeiro colocado do grupo por pontos", () => {
    const agg = [
      { team_id: "t1", team_name: "A", team_city: "", division: null, played: 1, wins: 1, draws: 0, losses: 0, goals_for: 1, goals_against: 0, goal_diff: 1, points: 3, yellow_cards: 0, red_cards: 0 },
      { team_id: "t2", team_name: "B", team_city: "", division: null, played: 1, wins: 0, draws: 0, losses: 1, goals_for: 0, goals_against: 1, goal_diff: -1, points: 0, yellow_cards: 0, red_cards: 0 },
    ];
    const out = filterAggregatesByBracketGroupPlacement(agg, {
      groupOptions: [mockGroup],
      placement: "first_per_group",
      groupSelectValue: "ALL",
      allGroupSelectValue: "ALL",
      sportSelectValue: "ALL",
      allSportSelectValue: "ALL",
      naipeSelectValue: "ALL",
      allNaipeSelectValue: "ALL",
      sortOptions: baseSortOptions,
      resolveTieBreakerRuleForSport: () => ChampionshipSportTieBreakerRule.STANDARD,
      finalTieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.team_id).toBe("t1");
  });
});
