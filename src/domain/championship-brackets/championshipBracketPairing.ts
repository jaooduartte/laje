import { MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  resolveModalidadeConfig,
  resolveSportCode,
  type KnockoutPairingMode,
} from "@/lib/modalidadeConfig";

export type ChampionshipKnockoutPairingMode =
  | KnockoutPairingMode
  | "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS";

export type EditableChampionshipKnockoutPairingMode =
  | "LINEAR"
  | "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS";

export interface ChampionshipKnockoutPairingContext {
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
}

export const CHAMPIONSHIP_KNOCKOUT_PAIRING_MODE_OPTIONS: Array<{
  value: EditableChampionshipKnockoutPairingMode;
  label: string;
  helper: string;
}> = [
  {
    value: "LINEAR",
    label: "Linear",
    helper: "Mantém o seeding padrão do mata-mata.",
  },
  {
    value: "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS",
    label: "Cruzar 2 chaves",
    helper: "Nesta versão, disponível apenas para Futebol Society Feminino Divisão de Acesso.",
  },
];

const KNOCKOUT_PAIRING_MODE_VALUES = new Set<ChampionshipKnockoutPairingMode>([
  "LINEAR",
  "FUTEVOLEI_FEM_INVERTED",
  "BEACH_SOCCER_FEM_DIRECT_SEMI",
  "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS",
]);

const LEGACY_KNOCKOUT_PAIRING_MODES = new Set<ChampionshipKnockoutPairingMode>([
  "FUTEVOLEI_FEM_INVERTED",
  "BEACH_SOCCER_FEM_DIRECT_SEMI",
]);

export function resolveCompetitionKnockoutPairingModeValue(
  value: unknown,
): ChampionshipKnockoutPairingMode {
  if (
    typeof value == "string" &&
    KNOCKOUT_PAIRING_MODE_VALUES.has(value as ChampionshipKnockoutPairingMode)
  ) {
    return value as ChampionshipKnockoutPairingMode;
  }

  return "LINEAR";
}

export function resolveCompetitionKnockoutPairingModeControlValue(
  value: ChampionshipKnockoutPairingMode | null | undefined,
): EditableChampionshipKnockoutPairingMode {
  const resolvedValue = resolveCompetitionKnockoutPairingModeValue(value);

  if (resolvedValue == "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS") {
    return resolvedValue;
  }

  return "LINEAR";
}

export function resolveCompetitionKnockoutPairingModeLabel(
  value: EditableChampionshipKnockoutPairingMode,
): string {
  return (
    CHAMPIONSHIP_KNOCKOUT_PAIRING_MODE_OPTIONS.find((option) => option.value == value)
      ?.label ?? "Linear"
  );
}

export function resolveIsLegacyKnockoutPairingMode(
  value: ChampionshipKnockoutPairingMode | null | undefined,
): boolean {
  return LEGACY_KNOCKOUT_PAIRING_MODES.has(
    resolveCompetitionKnockoutPairingModeValue(value),
  );
}

export function resolveIsCrossGroupKnockoutPairingAvailable(
  context: ChampionshipKnockoutPairingContext,
): boolean {
  return (
    context.sport_name == "Futebol Society" &&
    context.naipe == MatchNaipe.FEMININO &&
    context.division == TeamDivision.DIVISAO_ACESSO
  );
}

export function resolveDefaultCompetitionKnockoutPairingMode(
  context: ChampionshipKnockoutPairingContext,
): ChampionshipKnockoutPairingMode {
  if (resolveIsCrossGroupKnockoutPairingAvailable(context)) {
    return "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS";
  }

  return resolveModalidadeConfig(
    resolveSportCode(context.sport_name),
    context.naipe,
  ).knockout_pairing_mode;
}
