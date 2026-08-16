import { describe, expect, it } from "vitest";
import {
  resolveBracketPairingByMode,
  resolveChampionshipBracketFirstRoundSeedIndexes,
  resolveChampionshipBracketKnockoutProjection,
  resolveChampionshipBracketSeedPlaceholderLabels,
  resolveStandardBalancedBracketSeedOrder,
} from "./championshipBracketKnockoutProjection";

describe("resolveChampionshipBracketKnockoutProjection", () => {
  it("usa apenas melhores 1º quando a quantidade de grupos já fecha chave", () => {
    const projection = resolveChampionshipBracketKnockoutProjection({
      groups_count: 4,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: false,
    });

    expect(projection.direct_qualified_team_count).toBe(4);
    expect(projection.projected_bracket_size).toBe(4);
    expect(projection.best_second_placed_team_count).toBe(0);
    expect(projection.uses_best_second_placed_teams).toBe(false);
  });

  it("completa com melhores 2º no mínimo necessário quando não fecha chave", () => {
    const projection = resolveChampionshipBracketKnockoutProjection({
      groups_count: 3,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: false,
    });

    expect(projection.direct_qualified_team_count).toBe(3);
    expect(projection.projected_bracket_size).toBe(4);
    expect(projection.best_second_placed_team_count).toBe(1);
    expect(projection.uses_best_second_placed_teams).toBe(true);
  });

  it("mantém modo expandido: sempre sobe para a próxima chave com melhores 2º", () => {
    const projection = resolveChampionshipBracketKnockoutProjection({
      groups_count: 4,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: true,
    });

    expect(projection.direct_qualified_team_count).toBe(4);
    expect(projection.projected_bracket_size).toBe(8);
    expect(projection.best_second_placed_team_count).toBe(4);
    expect(projection.uses_best_second_placed_teams).toBe(true);
  });

  it("completa a chave de dois classificados por grupo com melhores 3º", () => {
    const input = {
      groups_count: 3,
      qualifiers_per_group: 2,
      should_complete_knockout_with_best_second_placed_teams: false,
    };

    expect(resolveChampionshipBracketKnockoutProjection(input)).toMatchObject({
      direct_qualified_team_count: 6,
      projected_bracket_size: 8,
      best_second_placed_team_count: 0,
      best_third_placed_team_count: 2,
      uses_best_third_placed_teams: true,
      total_qualified_team_count: 8,
    });
    expect(resolveChampionshipBracketSeedPlaceholderLabels(input)).toContain(
      "1º melhor 3º",
    );
    expect(resolveChampionshipBracketSeedPlaceholderLabels(input)).toContain(
      "2º melhor 3º",
    );
  });
});

describe("resolveStandardBalancedBracketSeedOrder", () => {
  it("returns an empty array when bracket size is below 2", () => {
    expect(resolveStandardBalancedBracketSeedOrder(1)).toEqual([]);
    expect(resolveStandardBalancedBracketSeedOrder(0)).toEqual([]);
  });

  it("returns [1, 2] for a 2-team bracket", () => {
    expect(resolveStandardBalancedBracketSeedOrder(2)).toEqual([1, 2]);
  });

  it("returns [1, 4, 2, 3] for a 4-team bracket", () => {
    expect(resolveStandardBalancedBracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("returns [1, 8, 2, 7, 3, 6, 4, 5] for an 8-team bracket", () => {
    expect(resolveStandardBalancedBracketSeedOrder(8)).toEqual([
      1, 8, 2, 7, 3, 6, 4, 5,
    ]);
  });

  it("returns the expected layout for a 16-team bracket", () => {
    expect(resolveStandardBalancedBracketSeedOrder(16)).toEqual([
      1, 16, 2, 15, 3, 14, 4, 13, 5, 12, 6, 11, 7, 10, 8, 9,
    ]);
  });
});

describe("resolveChampionshipBracketFirstRoundSeedIndexes", () => {
    it("respeita o pareamento RANKING_ALTERNATING na chave de 8", () => {
    expect(
      resolveChampionshipBracketFirstRoundSeedIndexes(
        8,
        1,
        "RANKING_ALTERNATING",
      ),
    ).toEqual({
      home_seed_index: 0,
      away_seed_index: 7,
    });

    expect(
      resolveChampionshipBracketFirstRoundSeedIndexes(
        8,
        2,
        "RANKING_ALTERNATING",
      ),
    ).toEqual({
      home_seed_index: 2,
      away_seed_index: 5,
    });

    expect(
      resolveChampionshipBracketFirstRoundSeedIndexes(
        8,
        3,
        "RANKING_ALTERNATING",
      ),
    ).toEqual({
      home_seed_index: 1,
      away_seed_index: 6,
    });

    expect(
      resolveChampionshipBracketFirstRoundSeedIndexes(
        8,
        4,
        "RANKING_ALTERNATING",
      ),
    ).toEqual({
      home_seed_index: 3,
      away_seed_index: 4,
    });
  });
  
  it("pairs 1 vs 4 and 2 vs 3 in a 4-team bracket", () => {
    expect(resolveChampionshipBracketFirstRoundSeedIndexes(4, 1)).toEqual({
      home_seed_index: 0,
      away_seed_index: 3,
    });
    expect(resolveChampionshipBracketFirstRoundSeedIndexes(4, 2)).toEqual({
      home_seed_index: 1,
      away_seed_index: 2,
    });
  });

  it("pairs 1v8, 2v7, 3v6, 4v5 in an 8-team bracket (seeding linear)", () => {
    expect(resolveChampionshipBracketFirstRoundSeedIndexes(8, 1)).toEqual({
      home_seed_index: 0, // seed 1
      away_seed_index: 7, // seed 8
    });
    expect(resolveChampionshipBracketFirstRoundSeedIndexes(8, 2)).toEqual({
      home_seed_index: 1, // seed 2
      away_seed_index: 6, // seed 7
    });
    expect(resolveChampionshipBracketFirstRoundSeedIndexes(8, 3)).toEqual({
      home_seed_index: 2, // seed 3
      away_seed_index: 5, // seed 6
    });
    expect(resolveChampionshipBracketFirstRoundSeedIndexes(8, 4)).toEqual({
      home_seed_index: 3, // seed 4
      away_seed_index: 4, // seed 5
    });
  });

  it("puts seeds 1 and 2 in the same half in a 16-team bracket", () => {
    const slot1 = resolveChampionshipBracketFirstRoundSeedIndexes(16, 1);
    const slot2 = resolveChampionshipBracketFirstRoundSeedIndexes(16, 2);

    expect(slot1.home_seed_index).toBe(0); // seed 1 no slot 1
    expect(slot2.home_seed_index).toBe(1); // seed 2 no slot 2 (mesmo lado)
  });
});

describe("resolveBracketPairingByMode", () => {
  it("produz pareamento LINEAR para chave de 8", () => {
    expect(resolveBracketPairingByMode("LINEAR", 8)).toEqual([
      1, 8, 2, 7, 3, 6, 4, 5,
    ]);
  });

  it("produz pareamento RANKING_ALTERNATING para chave de 8", () => {
    expect(resolveBracketPairingByMode("RANKING_ALTERNATING", 8)).toEqual([
      1, 8, 3, 6, 2, 7, 4, 5,
    ]);
  });

  it("produz pareamento CLASSIC_SEEDED para chave de 8", () => {
    expect(resolveBracketPairingByMode("CLASSIC_SEEDED", 8)).toEqual([
      1, 8, 4, 5, 2, 7, 3, 6,
    ]);
  });
});

describe("resolveChampionshipBracketSeedPlaceholderLabels", () => {
    it("ranqueia os primeiros colocados entre os grupos no modo de apenas primeiros", () => {
    const labels = resolveChampionshipBracketSeedPlaceholderLabels({
      groups_count: 4,
      qualifiers_per_group: 1,
      should_complete_knockout_with_best_second_placed_teams: false,
    });

    expect(labels).toEqual([
      "1º melhor 1º",
      "2º melhor 1º",
      "3º melhor 1º",
      "4º melhor 1º",
    ]);
  });

  it("gera rótulos corretos para 2 grupos × 2 classificados (Beach Soccer Fem / semis diretas)", () => {
    const labels = resolveChampionshipBracketSeedPlaceholderLabels({
      groups_count: 2,
      qualifiers_per_group: 2,
    });

    expect(labels).toEqual([
      "1º do Grupo A",
      "1º do Grupo B",
      "2º do Grupo A",
      "2º do Grupo B",
    ]);
  });

  it("gera rótulos corretos para 4 grupos × 2 classificados (Futevôlei)", () => {
    const labels = resolveChampionshipBracketSeedPlaceholderLabels({
      groups_count: 4,
      qualifiers_per_group: 2,
    });

    expect(labels).toEqual([
      "1º do Grupo A",
      "1º do Grupo B",
      "1º do Grupo C",
      "1º do Grupo D",
      "2º do Grupo A",
      "2º do Grupo B",
      "2º do Grupo C",
      "2º do Grupo D",
    ]);
  });

  it("cruzamentos de Beach Soccer Fem são 1ºA×2ºB e 1ºB×2ºA", () => {
    const labels = resolveChampionshipBracketSeedPlaceholderLabels({
      groups_count: 2,
      qualifiers_per_group: 2,
    });
    const seedOrder = resolveStandardBalancedBracketSeedOrder(4); // [1,4,2,3]

    const slot1Home = labels[seedOrder[0]! - 1];
    const slot1Away = labels[seedOrder[1]! - 1];
    const slot2Home = labels[seedOrder[2]! - 1];
    const slot2Away = labels[seedOrder[3]! - 1];

    expect(slot1Home).toBe("1º do Grupo A");
    expect(slot1Away).toBe("2º do Grupo B");
    expect(slot2Home).toBe("1º do Grupo B");
    expect(slot2Away).toBe("2º do Grupo A");
  });

  it("cruzamentos de Futevôlei Fem invertido: 1ºA×2ºD, 1ºB×2ºC, 1ºC×2ºB, 1ºD×2ºA", () => {
    const labels = resolveChampionshipBracketSeedPlaceholderLabels({
      groups_count: 4,
      qualifiers_per_group: 2,
    });
    const seedOrder = resolveStandardBalancedBracketSeedOrder(8); // [1,8,2,7,3,6,4,5]

    const matchups = Array.from({ length: 4 }, (_, i) => ({
      home: labels[seedOrder[i * 2]! - 1],
      away: labels[seedOrder[i * 2 + 1]! - 1],
    }));

    expect(matchups[0]).toEqual({
      home: "1º do Grupo A",
      away: "2º do Grupo D",
    });
    expect(matchups[1]).toEqual({
      home: "1º do Grupo B",
      away: "2º do Grupo C",
    });
    expect(matchups[2]).toEqual({
      home: "1º do Grupo C",
      away: "2º do Grupo B",
    });
    expect(matchups[3]).toEqual({
      home: "1º do Grupo D",
      away: "2º do Grupo A",
    });
  });
});
