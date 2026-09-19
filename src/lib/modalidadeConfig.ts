import { ChampionshipSportTieBreakerRule, type MatchNaipe } from "@/lib/enums";
import type { ChampionshipSport, Sport } from "@/lib/types";

export type StandingsColumnKey =
  | "J"
  | "V"
  | "E"
  | "D"
  | "PTS"
  | "GP"
  | "GC"
  | "SG"
  | "PA"
  | "SA"
  | "SV"
  | "SP"
  | "PR"
  | "PC"
  | "CA"
  | "CV"
  | "CAZ"
  | "2M";

export type TieBreakCriterion =
  | "POINTS"
  | "WINS"
  | "HEAD_TO_HEAD"
  | "POINTS_AVERAGE"
  | "SETS_AVERAGE"
  | "SETS_FOR"
  | "SETS_AGAINST_ASC"
  | "RALLY_POINTS_FOR"
  | "RALLY_POINTS_AGAINST_ASC"
  | "GOAL_DIFF"
  | "GOALS_FOR"
  | "GOALS_AGAINST_ASC"
  | "YELLOW_CARDS_ASC"
  | "RED_CARDS_ASC"
  | "BLUE_CARDS_ASC"
  | "TWO_MINUTE_PENALTIES_ASC"
  | "MANUAL_DRAW";

export type KnockoutPairingMode =
  | "LINEAR"
  | "RANKING_ALTERNATING"
  | "CLASSIC_SEEDED";

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
  PTS: "PTS",
  GP: "GP",
  GC: "GC",
  SG: "SG",
  PA: "PA",
  SA: "SA",
  SV: "SV",
  SP: "SP",
  PR: "PR",
  PC: "PC",
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
  PTS: "Pontos",
  GP: "Gols pró",
  GC: "Gols contra",
  SG: "Saldo de gols",
  PA: "Pontos médios (GP ÷ GC)",
  SA: "Sets average (sets vencidos ÷ sets perdidos)",
  SV: "Sets vencidos",
  SP: "Sets perdidos",
  PR: "Pontos de rally vencidos",
  PC: "Pontos de rally sofridos",
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
  "POINTS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_AGAINST_ASC", "BLUE_CARDS_ASC", "RED_CARDS_ASC", "YELLOW_CARDS_ASC", "TWO_MINUTE_PENALTIES_ASC", "MANUAL_DRAW",
];

const POINTS_AVERAGE_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "GP", "GC", "SG", "PA"];
const POINTS_AVERAGE_CASCADE: TieBreakCriterion[] = [
  "POINTS", "HEAD_TO_HEAD", "POINTS_AVERAGE", "GOAL_DIFF", "GOALS_FOR", "WINS", "MANUAL_DRAW",
];

const INTERLAJE_POLICY_CRITERIA: Partial<Record<string, TieBreakCriterion>> = {
  POINTS: "POINTS",
  POINTS_AVERAGE: "POINTS_AVERAGE",
  HEAD_TO_HEAD_EXACTLY_TWO: "HEAD_TO_HEAD",
  POINT_DIFF: "GOAL_DIFF",
  POINTS_FOR: "GOALS_FOR",
  POINTS_AGAINST_ASC: "GOALS_AGAINST_ASC",
  GOAL_DIFF: "GOAL_DIFF",
  GOALS_FOR: "GOALS_FOR",
  GOALS_AGAINST_ASC: "GOALS_AGAINST_ASC",
  SETS_AVERAGE: "SETS_AVERAGE",
  SETS_FOR: "SETS_FOR",
  SETS_AGAINST_ASC: "SETS_AGAINST_ASC",
  RALLY_POINTS_FOR: "RALLY_POINTS_FOR",
  RALLY_POINTS_AGAINST_ASC: "RALLY_POINTS_AGAINST_ASC",
  BLUE_CARDS_ASC: "BLUE_CARDS_ASC",
  RED_CARDS_ASC: "RED_CARDS_ASC",
  YELLOW_CARDS_ASC: "YELLOW_CARDS_ASC",
  TWO_MINUTE_PENALTIES_ASC: "TWO_MINUTE_PENALTIES_ASC",
  MANUAL_DRAW: "MANUAL_DRAW",
};

const STANDINGS_COLUMN_BY_CRITERION: Partial<
  Record<TieBreakCriterion, StandingsColumnKey>
> = {
  POINTS: "PTS",
  WINS: "V",
  POINTS_AVERAGE: "PA",
  SETS_AVERAGE: "SA",
  SETS_FOR: "SV",
  SETS_AGAINST_ASC: "SP",
  RALLY_POINTS_FOR: "PR",
  RALLY_POINTS_AGAINST_ASC: "PC",
  GOAL_DIFF: "SG",
  GOALS_FOR: "GP",
  GOALS_AGAINST_ASC: "GC",
  YELLOW_CARDS_ASC: "CA",
  RED_CARDS_ASC: "CV",
  BLUE_CARDS_ASC: "CAZ",
  TWO_MINUTE_PENALTIES_ASC: "2M",
};

export function resolveStandingsDisplayColumns(
  cascade: readonly TieBreakCriterion[],
): StandingsColumnKey[] {
  const criteriaColumns: StandingsColumnKey[] = [];

  cascade.forEach((criterion) => {
    const column = STANDINGS_COLUMN_BY_CRITERION[criterion];
    if (column && !criteriaColumns.includes(column)) {
      criteriaColumns.push(column);
    }
  });

  return ["J", "V", "E", "D", ...criteriaColumns.reverse()];
}

function resolveVolleyballDisplayColumns(
  columns: StandingsColumnKey[],
): StandingsColumnKey[] {
  if (
    !columns.includes("PR") ||
    !columns.includes("SV") ||
    !columns.includes("SA")
  ) {
    return columns;
  }

  const columnsWithoutRallyPointsForAndPointsAverage = columns.filter(
    (column) => column != "PR" && column != "PA",
  );
  const setsForIndex =
    columnsWithoutRallyPointsForAndPointsAverage.indexOf("SV");
  const setsAverageIndex =
    columnsWithoutRallyPointsForAndPointsAverage.indexOf("SA");
  const rallyPointsForIndex = setsForIndex >= 0
    ? setsForIndex + 1
    : Math.max(setsAverageIndex, 0);

  columnsWithoutRallyPointsForAndPointsAverage.splice(
    rallyPointsForIndex,
    0,
    "PR",
  );

  const updatedSetsAverageIndex =
    columnsWithoutRallyPointsForAndPointsAverage.indexOf("SA");
  columnsWithoutRallyPointsForAndPointsAverage.splice(
    Math.max(updatedSetsAverageIndex, 0),
    0,
    "PA",
  );

  return columnsWithoutRallyPointsForAndPointsAverage;
}

function resolveDisplayColumnsForSport(
  sportCode: string,
  cascade: readonly TieBreakCriterion[],
): StandingsColumnKey[] {
  const columns = resolveStandingsDisplayColumns(cascade);

  return sportCode == "VOLEIBOL"
    ? resolveVolleyballDisplayColumns(columns)
    : columns;
}

function resolveInterlajePolicyCascade(
  classificationPolicy: Record<string, unknown> | null | undefined,
): TieBreakCriterion[] {
  const criteria = classificationPolicy?.criteria;
  if (!Array.isArray(criteria)) {
    return [];
  }

  return criteria.flatMap((criterion) => {
    if (typeof criterion != "string") {
      return [];
    }

    const mappedCriterion = INTERLAJE_POLICY_CRITERIA[criterion];
    return mappedCriterion ? [mappedCriterion] : [];
  });
}

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
    display_columns: POINTS_AVERAGE_COLUMNS,
    tie_breaker_cascade: POINTS_AVERAGE_CASCADE,
    uses_points_average: true,
    uses_cards: false,
    knockout_pairing_mode: "LINEAR",
    legacy_tie_breaker_rule: ChampionshipSportTieBreakerRule.STANDARD,
  },
  {
    sport_code: "FUTSAL",
    naipe: null,
    display_columns: INTERLAJE_CARD_SPORT_COLUMNS,
    tie_breaker_cascade: ["POINTS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_FOR", "RED_CARDS_ASC", "YELLOW_CARDS_ASC", "MANUAL_DRAW"],
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
    return {
      ...exactMatch,
      display_columns: resolveDisplayColumnsForSport(
        exactMatch.sport_code,
        exactMatch.tie_breaker_cascade,
      ),
    };
  }

  const fallbackMatch = MODALIDADE_CONFIGS.find(
    (config) => config.sport_code == sportCode && config.naipe == null,
  );

  const resolvedConfig = fallbackMatch ?? DEFAULT_CONFIG;
  return {
    ...resolvedConfig,
    display_columns: resolveDisplayColumnsForSport(
      resolvedConfig.sport_code,
      resolvedConfig.tie_breaker_cascade,
    ),
  };
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
  const modalidadeConfig = resolveModalidadeConfigBySportId(
    championshipSport.sport_id,
    naipe,
    sports,
  );
  const classificationPolicyCascade = resolveInterlajePolicyCascade(
    championshipSport.classification_policy,
  );
  const tieBreakerCascade =
    classificationPolicyCascade.length > 0
      ? classificationPolicyCascade
      : resolveCascadeForLegacyRule(championshipSport.tie_breaker_rule);

  return {
    ...modalidadeConfig,
    tie_breaker_cascade: tieBreakerCascade,
    display_columns: resolveDisplayColumnsForSport(
      modalidadeConfig.sport_code,
      tieBreakerCascade,
    ),
  };
}
