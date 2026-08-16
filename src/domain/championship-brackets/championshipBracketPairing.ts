import type { KnockoutPairingMode } from "@/lib/modalidadeConfig";

export type ChampionshipKnockoutPairingMode = KnockoutPairingMode;

const VALID_KNOCKOUT_PAIRING_MODE_VALUES =
  new Set<ChampionshipKnockoutPairingMode>([
    "LINEAR",
    "RANKING_ALTERNATING",
    "CLASSIC_SEEDED",
  ]);

const LEGACY_KNOCKOUT_PAIRING_MODE_VALUES = new Set([
  "FUTEVOLEI_FEM_INVERTED",
  "BEACH_SOCCER_FEM_DIRECT_SEMI",
  "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS",
]);

export function resolveCompetitionKnockoutPairingModeValue(
  value: unknown,
): ChampionshipKnockoutPairingMode {
  if (
    typeof value === "string" &&
    VALID_KNOCKOUT_PAIRING_MODE_VALUES.has(
      value as ChampionshipKnockoutPairingMode,
    )
  ) {
    return value as ChampionshipKnockoutPairingMode;
  }

  if (
    typeof value === "string" &&
    LEGACY_KNOCKOUT_PAIRING_MODE_VALUES.has(value)
  ) {
    return "LINEAR";
  }

  return "LINEAR";
}

export function resolveDefaultCompetitionKnockoutPairingMode(): ChampionshipKnockoutPairingMode {
  return "CLASSIC_SEEDED";
}

function resolveIsSupportedBracketSize(bracketSize: number): boolean {
  return (
    Number.isInteger(bracketSize) &&
    bracketSize >= 2 &&
    (bracketSize & (bracketSize - 1)) === 0
  );
}

function resolveLinearSeedOrder(bracketSize: number): number[] {
  const seedOrder: number[] = [];

  for (let seed = 1; seed <= bracketSize / 2; seed += 1) {
    seedOrder.push(seed, bracketSize + 1 - seed);
  }

  return seedOrder;
}

function resolveRankingAlternatingSeedOrder(
  bracketSize: number,
): number[] {
  const firstHalfSeeds = Array.from(
    { length: bracketSize / 2 },
    (_, index) => index + 1,
  );

  const orderedSeeds = [
    ...firstHalfSeeds.filter((seed) => seed % 2 === 1),
    ...firstHalfSeeds.filter((seed) => seed % 2 === 0),
  ];

  return orderedSeeds.flatMap((seed) => [
    seed,
    bracketSize + 1 - seed,
  ]);
}

function resolveClassicSeedOrder(bracketSize: number): number[] {
  if (bracketSize === 2) {
    return [1, 2];
  }

  const previousRoundSeedOrder =
    resolveClassicSeedOrder(bracketSize / 2);

  return previousRoundSeedOrder.flatMap((seed) => [
    seed,
    bracketSize + 1 - seed,
  ]);
}

export function resolveChampionshipKnockoutSeedOrder(
  mode: ChampionshipKnockoutPairingMode,
  bracketSize: number,
): number[] {
  if (!resolveIsSupportedBracketSize(bracketSize)) {
    return [];
  }

  switch (mode) {
    case "RANKING_ALTERNATING":
      return resolveRankingAlternatingSeedOrder(bracketSize);

    case "CLASSIC_SEEDED":
      return resolveClassicSeedOrder(bracketSize);

    case "LINEAR":
    default:
      return resolveLinearSeedOrder(bracketSize);
  }
}