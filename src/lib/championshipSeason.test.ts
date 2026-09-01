import { describe, expect, it } from "vitest";
import {
  ChampionshipCode,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  MatchNaipe,
  TeamDivision,
  YellowCardResetPhase,
} from "@/lib/enums";
import type { Standing } from "@/lib/types";
import {
  resolveChampionshipOverallSeasonStandings,
  resolveEffectiveChampionshipSeasonSettings,
  resolveChampionshipSeasonSettingsFromBracketPayload,
  resolveSeasonDivisionMovementPreview,
} from "@/lib/championshipSeason";

function buildStanding(overrides: Partial<Standing> & Pick<Standing, "id" | "team_id">): Standing {
  return {
    id: overrides.id,
    championship_id: overrides.championship_id ?? "championship-1",
    season_year: overrides.season_year ?? 2026,
    division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
    naipe: overrides.naipe ?? MatchNaipe.MASCULINO,
    sport_id: overrides.sport_id ?? "sport-1",
    team_id: overrides.team_id,
    played: overrides.played ?? 1,
    wins: overrides.wins ?? 1,
    draws: overrides.draws ?? 0,
    losses: overrides.losses ?? 0,
    goals_for: overrides.goals_for ?? 1,
    goals_against: overrides.goals_against ?? 0,
    goal_diff: overrides.goal_diff ?? 1,
    points: overrides.points ?? 3,
    yellow_cards: overrides.yellow_cards ?? 0,
    red_cards: overrides.red_cards ?? 0,
    updated_at: overrides.updated_at ?? "2026-08-01T12:00:00.000Z",
    championships: overrides.championships,
    teams: overrides.teams ?? {
      id: overrides.team_id,
      name: `Atlética ${overrides.team_id}`,
      city: "Joinville",
      division: overrides.division ?? TeamDivision.DIVISAO_PRINCIPAL,
      created_at: "2026-08-01T12:00:00.000Z",
    },
    sports: overrides.sports,
  };
}

describe("championshipSeason", () => {
  it("mantém compatibilidade legada com uses_divisions quando a temporada ainda não foi configurada", () => {
    const resolvedSettings = resolveEffectiveChampionshipSeasonSettings({
      championship: {
        code: ChampionshipCode.SOCIETY,
        uses_divisions: true,
      },
      seasonSettings: null,
    });

    expect(resolvedSettings.division_format).toBe(ChampionshipSeasonDivisionFormat.SEPARATED);
    expect(resolvedSettings.division_settlement_mode).toBe(ChampionshipSeasonDivisionSettlementMode.NONE);
  });

  it("mantém o padrão de divisão do Interlaje sem configuração sazonal", () => {
    const resolvedSettings = resolveEffectiveChampionshipSeasonSettings({
      championship: {
        code: ChampionshipCode.INTERLAJE,
        uses_divisions: true,
      },
      seasonSettings: null,
    });

    expect(resolvedSettings.division_format).toBe(ChampionshipSeasonDivisionFormat.SEPARATED);
    expect(resolvedSettings.division_settlement_mode).toBe(
      ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
    );
  });

  it("recupera o formato unificado no snapshot da edição", () => {
    expect(
      resolveChampionshipSeasonSettingsFromBracketPayload({
        season_settings: {
          division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
          division_settlement_mode:
            ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL,
          principal_slots_count: 12,
          principal_relegation_count: null,
          access_promotion_count: null,
        },
      }),
    ).toEqual({
      division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
      division_settlement_mode:
        ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL,
      principal_slots_count: 12,
      principal_relegation_count: null,
      access_promotion_count: null,
      yellow_card_reset_phase: YellowCardResetPhase.NONE,
    });
  });

  it("aplica correção de pontos no ranking geral oficial", () => {
    const standings = [
      buildStanding({
        id: "standing-a",
        team_id: "team-a",
        points: 6,
        teams: {
          id: "team-a",
          name: "Atlética A",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-08-01T12:00:00.000Z",
        },
      }),
      buildStanding({
        id: "standing-b",
        team_id: "team-b",
        points: 5,
        teams: {
          id: "team-b",
          name: "Atlética B",
          city: "Joinville",
          division: TeamDivision.DIVISAO_PRINCIPAL,
          created_at: "2026-08-01T12:00:00.000Z",
        },
      }),
    ];

    const overallStandings = resolveChampionshipOverallSeasonStandings({
      standings,
      correctedStandingsByKey: {
        "team-a:sport-1:MASCULINO:DIVISAO_PRINCIPAL": {
          points_base: 6,
          corrected_points: 1,
        },
      },
    });

    expect(overallStandings.map((standing) => standing.team_id)).toEqual(["team-b", "team-a"]);
    expect(overallStandings.find((standing) => standing.team_id == "team-a")?.points).toBe(1);
  });

  it("gera prévia separada do Interlaje com 2 sobem e 2 caem", () => {
    const preview = resolveSeasonDivisionMovementPreview({
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
        principal_slots_count: null,
        principal_relegation_count: 2,
        access_promotion_count: 2,
      },
      standings: [
        { team_id: "principal-1", team_name: "Principal 1", team_city: "Jlle", division: TeamDivision.DIVISAO_PRINCIPAL, played: 1, wins: 1, draws: 0, losses: 0, goals_for: 1, goals_against: 0, goal_diff: 1, points: 3, yellow_cards: 0, red_cards: 0 },
        { team_id: "principal-2", team_name: "Principal 2", team_city: "Jlle", division: TeamDivision.DIVISAO_PRINCIPAL, played: 1, wins: 1, draws: 0, losses: 0, goals_for: 1, goals_against: 0, goal_diff: 1, points: 2, yellow_cards: 0, red_cards: 0 },
        { team_id: "principal-3", team_name: "Principal 3", team_city: "Jlle", division: TeamDivision.DIVISAO_PRINCIPAL, played: 1, wins: 0, draws: 0, losses: 1, goals_for: 0, goals_against: 1, goal_diff: -1, points: 1, yellow_cards: 0, red_cards: 0 },
        { team_id: "principal-4", team_name: "Principal 4", team_city: "Jlle", division: TeamDivision.DIVISAO_PRINCIPAL, played: 1, wins: 0, draws: 0, losses: 1, goals_for: 0, goals_against: 1, goal_diff: -1, points: 0, yellow_cards: 0, red_cards: 0 },
        { team_id: "access-1", team_name: "Acesso 1", team_city: "Jlle", division: TeamDivision.DIVISAO_ACESSO, played: 1, wins: 1, draws: 0, losses: 0, goals_for: 1, goals_against: 0, goal_diff: 1, points: 3, yellow_cards: 0, red_cards: 0 },
        { team_id: "access-2", team_name: "Acesso 2", team_city: "Jlle", division: TeamDivision.DIVISAO_ACESSO, played: 1, wins: 1, draws: 0, losses: 0, goals_for: 1, goals_against: 0, goal_diff: 1, points: 2, yellow_cards: 0, red_cards: 0 },
        { team_id: "access-3", team_name: "Acesso 3", team_city: "Jlle", division: TeamDivision.DIVISAO_ACESSO, played: 1, wins: 0, draws: 0, losses: 1, goals_for: 0, goals_against: 1, goal_diff: -1, points: 1, yellow_cards: 0, red_cards: 0 },
      ],
    });

    expect(preview.map((movement) => `${movement.team_id}:${movement.next_division}`)).toEqual([
      "access-1:DIVISAO_PRINCIPAL",
      "access-2:DIVISAO_PRINCIPAL",
      "principal-3:DIVISAO_ACESSO",
      "principal-4:DIVISAO_ACESSO",
    ]);
  });

  it("gera prévia unificada com top 12 para a principal", () => {
    const preview = resolveSeasonDivisionMovementPreview({
      seasonSettings: {
        division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
        division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL,
        principal_slots_count: 12,
        principal_relegation_count: null,
        access_promotion_count: null,
      },
      standings: Array.from({ length: 14 }, (_, index) => ({
        team_id: `team-${index + 1}`,
        team_name: `Team ${index + 1}`,
        team_city: "Jlle",
        division: index < 10 ? TeamDivision.DIVISAO_PRINCIPAL : TeamDivision.DIVISAO_ACESSO,
        played: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        goals_for: 1,
        goals_against: 0,
        goal_diff: 1,
        points: 20 - index,
        yellow_cards: 0,
        red_cards: 0,
      })),
    });

    expect(preview.filter((movement) => movement.next_division == TeamDivision.DIVISAO_PRINCIPAL)).toHaveLength(12);
    expect(preview.find((movement) => movement.team_id == "team-12")?.next_division).toBe(TeamDivision.DIVISAO_PRINCIPAL);
    expect(preview.find((movement) => movement.team_id == "team-13")?.next_division).toBe(TeamDivision.DIVISAO_ACESSO);
  });
});
