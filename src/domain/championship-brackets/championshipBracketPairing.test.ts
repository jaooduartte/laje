import { describe, expect, it } from "vitest";
import {
  resolveChampionshipKnockoutSeedOrder,
  resolveCompetitionKnockoutPairingModeValue,
  resolveDefaultCompetitionKnockoutPairingMode,
  type ChampionshipKnockoutPairingMode,
} from "@/domain/championship-brackets/championshipBracketPairing";

describe("championshipBracketPairing", () => {
  describe("resolveDefaultCompetitionKnockoutPairingMode", () => {
    it("usa CLASSIC_SEEDED como padrão para novas competições", () => {
      expect(
        resolveDefaultCompetitionKnockoutPairingMode(),
      ).toBe("CLASSIC_SEEDED");
    });
  });

  describe("resolveCompetitionKnockoutPairingModeValue", () => {
    it.each<ChampionshipKnockoutPairingMode>([
      "LINEAR",
      "RANKING_ALTERNATING",
      "CLASSIC_SEEDED",
    ])("preserva o modo válido %s", (mode) => {
      expect(
        resolveCompetitionKnockoutPairingModeValue(mode),
      ).toBe(mode);
    });

    it("sanitiza valores legados para LINEAR", () => {
      expect(
        resolveCompetitionKnockoutPairingModeValue(
          "BEACH_SOCCER_FEM_DIRECT_SEMI",
        ),
      ).toBe("LINEAR");

      expect(
        resolveCompetitionKnockoutPairingModeValue(
          "FUTEVOLEI_FEM_INVERTED",
        ),
      ).toBe("LINEAR");

      expect(
        resolveCompetitionKnockoutPairingModeValue(
          "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS",
        ),
      ).toBe("LINEAR");
    });

    it("sanitiza valores ausentes ou inválidos para LINEAR", () => {
      expect(
        resolveCompetitionKnockoutPairingModeValue(undefined),
      ).toBe("LINEAR");

      expect(
        resolveCompetitionKnockoutPairingModeValue(null),
      ).toBe("LINEAR");

      expect(
        resolveCompetitionKnockoutPairingModeValue("INVALID"),
      ).toBe("LINEAR");
    });
  });

  describe("resolveChampionshipKnockoutSeedOrder", () => {
    it.each([
      ["LINEAR", 2, [1, 2]],
      ["LINEAR", 4, [1, 4, 2, 3]],
      ["LINEAR", 8, [1, 8, 2, 7, 3, 6, 4, 5]],
      [
        "LINEAR",
        16,
        [
          1, 16,
          2, 15,
          3, 14,
          4, 13,
          5, 12,
          6, 11,
          7, 10,
          8, 9,
        ],
      ],

      ["RANKING_ALTERNATING", 2, [1, 2]],
      ["RANKING_ALTERNATING", 4, [1, 4, 2, 3]],
      [
        "RANKING_ALTERNATING",
        8,
        [1, 8, 3, 6, 2, 7, 4, 5],
      ],
      [
        "RANKING_ALTERNATING",
        16,
        [
          1, 16,
          3, 14,
          5, 12,
          7, 10,
          2, 15,
          4, 13,
          6, 11,
          8, 9,
        ],
      ],

      ["CLASSIC_SEEDED", 2, [1, 2]],
      ["CLASSIC_SEEDED", 4, [1, 4, 2, 3]],
      [
        "CLASSIC_SEEDED",
        8,
        [1, 8, 4, 5, 2, 7, 3, 6],
      ],
      [
        "CLASSIC_SEEDED",
        16,
        [
          1, 16,
          8, 9,
          4, 13,
          5, 12,
          2, 15,
          7, 10,
          3, 14,
          6, 11,
        ],
      ],
    ] as const)(
      "%s gera a ordem esperada para chave de %i",
      (mode, bracketSize, expected) => {
        expect(
          resolveChampionshipKnockoutSeedOrder(
            mode,
            bracketSize,
          ),
        ).toEqual(expected);
      },
    );

    it.each([
      [
        "LINEAR",
        [
          [1, "BYE"],
          [2, "BYE"],
          [3, 6],
          [4, 5],
        ],
      ],
      [
        "RANKING_ALTERNATING",
        [
          [1, "BYE"],
          [3, 6],
          [2, "BYE"],
          [4, 5],
        ],
      ],
      [
        "CLASSIC_SEEDED",
        [
          [1, "BYE"],
          [4, 5],
          [2, "BYE"],
          [3, 6],
        ],
      ],
    ] as const)(
      "%s mantém os BYEs associados aos seeds 1 e 2 em uma chave 8 com 6 classificados",
      (mode, expectedMatches) => {
        const qualifiedTeamCount = 6;

        const seedOrder =
          resolveChampionshipKnockoutSeedOrder(mode, 8);

        const matches = Array.from(
          { length: seedOrder.length / 2 },
          (_, matchIndex) => {
            const homeSeed = seedOrder[matchIndex * 2]!;
            const awaySeed =
              seedOrder[matchIndex * 2 + 1]!;

            return [
              homeSeed > qualifiedTeamCount
                ? "BYE"
                : homeSeed,
              awaySeed > qualifiedTeamCount
                ? "BYE"
                : awaySeed,
            ];
          },
        );

        expect(matches).toEqual(expectedMatches);
      },
    );

    it("rejeita tamanhos de chave que não sejam potência de dois", () => {
      expect(
        resolveChampionshipKnockoutSeedOrder(
          "CLASSIC_SEEDED",
          0,
        ),
      ).toEqual([]);

      expect(
        resolveChampionshipKnockoutSeedOrder(
          "CLASSIC_SEEDED",
          1,
        ),
      ).toEqual([]);

      expect(
        resolveChampionshipKnockoutSeedOrder(
          "CLASSIC_SEEDED",
          6,
        ),
      ).toEqual([]);
    });
  });
});