import {
  BracketThirdPlaceMode,
  ChampionshipSportResultRule,
  MatchNaipe,
} from "@/lib/enums";
import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";

export const CHAMPIONSHIP_BRACKET_SLOT_GRANULARITY_MINUTES = 5;
export const CHAMPIONSHIP_BRACKET_COURT_TURNOVER_MINUTES = 5;
export const CHAMPIONSHIP_BRACKET_TEAM_REST_MINUTES = 15;

export const CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP = 1;

export const BRACKET_THIRD_PLACE_MODE_OPTIONS: BracketThirdPlaceMode[] = [
  BracketThirdPlaceMode.NONE,
  BracketThirdPlaceMode.MATCH,
  BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER,
];

export const CHAMPIONSHIP_BRACKET_SUPPORTED_NAIPE_OPTIONS: MatchNaipe[] = [
  MatchNaipe.MASCULINO,
  MatchNaipe.FEMININO,
  MatchNaipe.MISTO,
];

export const MATCH_SET_DEFAULT_VALUES: MatchSetInput[] = [
  {
    set_number: 1,
    home_points: 0,
    away_points: 0,
  },
  {
    set_number: 2,
    home_points: 0,
    away_points: 0,
  },
  {
    set_number: 3,
    home_points: 0,
    away_points: 0,
  },
];

export const CHAMPIONSHIP_SPORT_RESULT_RULE_DEFAULTS: Record<string, ChampionshipSportResultRule> = {
  "beach soccer": ChampionshipSportResultRule.POINTS,
  "beach tennis": ChampionshipSportResultRule.SETS,
  "volei de praia": ChampionshipSportResultRule.SETS,
  futevolei: ChampionshipSportResultRule.SETS,
};
