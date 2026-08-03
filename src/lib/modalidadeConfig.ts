import { ChampionshipSportTieBreakerRule, type MatchNaipe } from "@/lib/enums";
import type { ChampionshipSport, Sport } from "@/lib/types";

export type StandingsColumnKey =
  | "J"
  | "V"
  | "E"
  | "D"
  | "GP"
  | "GC"
  | "SG"
  | "PA"
  | "CA"
  | "CV"
  | "CAZ"
  | "2M";

export type TieBreakCriterion =
  | "POINTS"
  | "WINS"
  | "HEAD_TO_HEAD"
  | "POINTS_AVERAGE"
  | "GOAL_DIFF"
  | "GOALS_FOR"
  | "GOALS_AGAINST_ASC"
  | "YELLOW_CARDS_ASC"
  | "RED_CARDS_ASC"
  | "BLUE_CARDS_ASC"
  | "TWO_MINUTE_PENALTIES_ASC"
  | "MANUAL_DRAW";

export type KnockoutPairingMode =
  | "LINEAR";

export interface ModalidadeConfig {
  sport_code: string;
  naipe: MatchNaipe | null;
  display_columns: StandingsColumnKey[];
  tie_breaker_cascade: TieBreakCriterion[];
  uses_points_average: boolean;
  uses_cards: boolean;
  knockout_pairing_mode: KnockoutPairingMode;
  legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule;
}

export const STANDINGS_COLUMN_LABELS: Record<StandingsColumnKey, string> = {
  J: "J",
  V: "V",
  E: "E",
  D: "D",
  GP: "GP",
  GC: "GC",
  SG: "SG",
  PA: "PA",
  CA: "CA",
  CV: "CV",
  CAZ: "CAZ",
  "2M": "2M",
};

export const STANDINGS_COLUMN_TOOLTIPS: Partial<Record<StandingsColumnKey, string>> = {
  J: "Jogos",
  V: "Vitórias",
  E: "Empates",
  D: "Derrotas",
  GP: "Gols pró",
  GC: "Gols contra",
  SG: "Saldo de gols",
  PA: "Pontos médios (GP ÷ GC)",
  CA: "Cartões amarelos",
  CV: "Cartões vermelhos",
  CAZ: "Cartões azuis",
  "2M": "Penalidades de 2 minutos",
};

const BEACH_SOCCER_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "CA", "CV", "GP", "GC", "SG"];
const BEACH_SOCCER_CASCADE: TieBreakCriterion[] = [
  "POINTS", "HEAD_TO_HEAD", "WINS", "GOAL_DIFF", "GOALS_FOR",
  "GOALS_AGAINST_ASC", "YELLOW_CARDS_ASC", "RED_CARDS_ASC", "MANUAL_DRAW",
];

const FUTEBOL_SOCIETY_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "CA", "CV", "GP", "GC", "SG"];
const FUTEBOL_SOCIETY_CASCADE: TieBreakCriterion[] = [
  "POINTS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_FOR", "YELLOW_CARDS_ASC", "RED_CARDS_ASC", "MANUAL_DRAW",
];

const BEACH_TENNIS_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "GP", "GC", "SG"];
const BEACH_TENNIS_CASCADE: TieBreakCriterion[] = [
  "POINTS", "WINS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_FOR", "MANUAL_DRAW",
];

const INTERLAJE_BALL_SPORT_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "GP", "GC", "SG"];
const INTERLAJE_CARD_SPORT_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "CA", "CV", "GP", "GC", "SG"];
const INTERLAJE_HANDBALL_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "CAZ", "2M", "CA", "CV", "GP", "GC", "SG"];
const INTERLAJE_STANDARD_CASCADE: TieBreakCriterion[] = [
  "POINTS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_FOR", "WINS", "MANUAL_DRAW",
];
const INTERLAJE_CARD_CASCADE: TieBreakCriterion[] = [
  "POINTS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_FOR", "YELLOW_CARDS_ASC", "RED_CARDS_ASC", "MANUAL_DRAW",
];
const INTERLAJE_HANDBALL_CASCADE: TieBreakCriterion[] = [
  "POINTS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_FOR", "BLUE_CARDS_ASC", "TWO_MINUTE_PENALTIES_ASC", "MANUAL_DRAW",
];

const POINTS_AVERAGE_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "GP", "GC", "SG", "PA"];
const POINTS_AVERAGE_CASCADE: TieBreakCriterion[] = [
  "POINTS", "HEAD_TO_HEAD", "POINTS_AVERAGE", "GOAL_DIFF", "GOALS_FOR", "WINS", "MANUAL_DRAW",
];

const MODALIDADE_CONFIGS: ModalidadeConfig[] = [
  {
    sport_code: "BEACH_SOCCER",
    naipe: "MASCULINO" as MatchNaipe,
    display_columns: BEACH_SOCCER_COLUMNS,
    tie_breaker_cascade: BEACH_SOCCER_CASCADE,
    uses_points_average: false,
    uses_cards: true,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
  },
  {
    sport_code: "BEACH_SOCCER",
    naipe: "FEMININO" as MatchNaipe,
    display_columns: BEACH_SOCCER_COLUMNS,
    tie_breaker_cascade: BEACH_SOCCER_CASCADE,
    uses_points_average: false,
    uses_cards: true,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
  },
  {
    sport_code: "FUTEBOL_SOCIETY",
    naipe: "MASCULINO" as MatchNaipe,
    display_columns: FUTEBOL_SOCIETY_COLUMNS,
    tie_breaker_cascade: FUTEBOL_SOCIETY_CASCADE,
    uses_points_average: false,
    uses_cards: true,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
  },
  {
    sport_code: "FUTEBOL_SOCIETY",
    naipe: "FEMININO" as MatchNaipe,
    display_columns: FUTEBOL_SOCIETY_COLUMNS,
    tie_breaker_cascade: FUTEBOL_SOCIETY_CASCADE,
    uses_points_average: false,
    uses_cards: true,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
  },
  {
    sport_code: "BEACH_TENNIS",
    naipe: null,
    display_columns: BEACH_TENNIS_COLUMNS,
    tie_breaker_cascade: BEACH_TENNIS_CASCADE,
    uses_points_average: false,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.BEACH_TENNIS,
  },
  {
    sport_code: "FUTEVOLEI",
    naipe: "MASCULINO" as MatchNaipe,
    display_columns: POINTS_AVERAGE_COLUMNS,
    tie_breaker_cascade: POINTS_AVERAGE_CASCADE,
    uses_points_average: true,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
  },
  {
    sport_code: "FUTEVOLEI",
    naipe: "FEMININO" as MatchNaipe,
    display_columns: POINTS_AVERAGE_COLUMNS,
    tie_breaker_cascade: POINTS_AVERAGE_CASCADE,
    uses_points_average: true,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
  },
  {
    sport_code: "VOLEI_PRAIA",
    naipe: null,
    display_columns: POINTS_AVERAGE_COLUMNS,
    tie_breaker_cascade: POINTS_AVERAGE_CASCADE,
    uses_points_average: true,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
  },
  {
    sport_code: "BASQUETE",
    naipe: null,
    display_columns: INTERLAJE_BALL_SPORT_COLUMNS,
    tie_breaker_cascade: INTERLAJE_STANDARD_CASCADE,
    uses_points_average: false,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.STANDARD,
  },
  {
    sport_code: "FUTSAL",
    naipe: null,
    display_columns: INTERLAJE_CARD_SPORT_COLUMNS,
    tie_breaker_cascade: FUTEBOL_SOCIETY_CASCADE,
    uses_points_average: false,
    uses_cards: true,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
  },
  {
    sport_code: "HANDEBOL",
    naipe: null,
    display_columns: INTERLAJE_HANDBALL_COLUMNS,
    tie_breaker_cascade: INTERLAJE_HANDBALL_CASCADE,
    uses_points_average: false,
    uses_cards: true,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.HANDEBOL,
  },
  {
    sport_code: "VOLEIBOL",
    naipe: null,
    display_columns: POINTS_AVERAGE_COLUMNS,
    tie_breaker_cascade: POINTS_AVERAGE_CASCADE,
    uses_points_average: true,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
  },
  {
    sport_code: "ATLETISMO",
    naipe: null,
    display_columns: ["J", "V", "E", "D", "GP", "GC", "SG"],
    tie_breaker_cascade: [
      "POINTS", "GOAL_DIFF", "GOALS_FOR", "WINS",
      "YELLOW_CARDS_ASC", "RED_CARDS_ASC", "MANUAL_DRAW",
    ],
    uses_points_average: false,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.STANDARD,
  },
  {
    sport_code: "NATACAO",
    naipe: null,
    display_columns: ["J", "V", "E", "D", "GP", "GC", "SG"],
    tie_breaker_cascade: [
      "POINTS", "GOAL_DIFF", "GOALS_FOR", "WINS",
      "YELLOW_CARDS_ASC", "RED_CARDS_ASC", "MANUAL_DRAW",
    ],
    uses_points_average: false,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.STANDARD,
  },
];

const DEFAULT_CONFIG: ModalidadeConfig = {
  sport_code: "DEFAULT",
  naipe: null,
  display_columns: ["J", "V", "E", "D", "GP", "GC", "SG"],
  tie_breaker_cascade: [
    "POINTS", "GOAL_DIFF", "GOALS_FOR", "WINS",
    "YELLOW_CARDS_ASC", "RED_CARDS_ASC", "MANUAL_DRAW",
  ],
  uses_points_average: false,
  uses_cards: false,
  knockout_pairing_mode: "LINEAR",
  legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.STANDARD,
};

const SPORT_NAME_TO_CODE: Record<string, string> = {
  "Beach Soccer": "BEACH_SOCCER",
  "Beach Tennis": "BEACH_TENNIS",
  Basquetebol: "BASQUETE",
  "Futevôlei": "FUTEVOLEI",
  Futsal: "FUTSAL",
  Handebol: "HANDEBOL",
  Atletismo: "ATLETISMO",
  "Natação": "NATACAO",
  "Vôlei de Praia": "VOLEI_PRAIA",
  Voleibol: "VOLEIBOL",
  "Futebol Society": "FUTEBOL_SOCIETY",
};

export function resolveSportCode(sportName: string): string {
  return SPORT_NAME_TO_CODE[sportName] ?? "DEFAULT";
}

export function resolveModalidadeConfig(sportCode: string, naipe: MatchNaipe | null): ModalidadeConfig {
  const exactMatch = MODALIDADE_CONFIGS.find(
    (config) => config.sport_code == sportCode && config.naipe == naipe,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const fallbackMatch = MODALIDADE_CONFIGS.find(
    (config) => config.sport_code == sportCode && config.naipe == null,
  );

  return fallbackMatch ?? DEFAULT_CONFIG;
}

export function resolveCascadeForLegacyRule(rule: ChampionshipSportTieBreakerRule): TieBreakCriterion[] {
  switch (rule) {
    case ChampionshipSportTieBreakerRule.BEACH_SOCCER:
      return BEACH_SOCCER_CASCADE;
    case ChampionshipSportTieBreakerRule.BEACH_TENNIS:
      return BEACH_TENNIS_CASCADE;
    case ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY:
      return FUTEBOL_SOCIETY_CASCADE;
    case ChampionshipSportTieBreakerRule.HANDEBOL:
      return INTERLAJE_HANDBALL_CASCADE;
    case ChampionshipSportTieBreakerRule.POINTS_AVERAGE:
      return POINTS_AVERAGE_CASCADE;
    default:
      return DEFAULT_CONFIG.tie_breaker_cascade;
  }
}

export function resolveModalidadeConfigBySportId(
  sportId: string,
  naipe: MatchNaipe | null,
  sports: Sport[],
): ModalidadeConfig {
  const sport = sports.find((s) => s.id == sportId);

  if (!sport) {
    return DEFAULT_CONFIG;
  }

  return resolveModalidadeConfig(resolveSportCode(sport.name), naipe);
}

export function resolveModalidadeConfigByChampionshipSport(
  championshipSport: ChampionshipSport,
  sports: Sport[],
  naipe: MatchNaipe | null,
): ModalidadeConfig {
  return resolveModalidadeConfigBySportId(championshipSport.sport_id, naipe, sports);
}
