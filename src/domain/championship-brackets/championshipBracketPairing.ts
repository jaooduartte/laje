export type ChampionshipKnockoutPairingMode = "LINEAR";

const LEGACY_KNOCKOUT_PAIRING_MODE_VALUES = new Set([
  "LINEAR",
  "FUTEVOLEI_FEM_INVERTED",
  "BEACH_SOCCER_FEM_DIRECT_SEMI",
  "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS",
]);

export function resolveCompetitionKnockoutPairingModeValue(
  value: unknown,
): ChampionshipKnockoutPairingMode {
  if (typeof value == "string" && LEGACY_KNOCKOUT_PAIRING_MODE_VALUES.has(value)) {
    return "LINEAR";
  }

  return "LINEAR";
}

export function resolveDefaultCompetitionKnockoutPairingMode(): ChampionshipKnockoutPairingMode {
  return "LINEAR";
}
