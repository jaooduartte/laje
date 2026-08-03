import { BEACH_SOCCER_RULE } from "@/domain/sport-rules/beachSoccer.rule";
import { BEACH_TENNIS_RULE } from "@/domain/sport-rules/beachTennis.rule";
import { BEACH_VOLLEYBALL_RULE } from "@/domain/sport-rules/beachVolleyball.rule";
import { FUTEBOL_SOCIETY_RULE } from "@/domain/sport-rules/futebolSociety.rule";
import { FUTEVOLEI_RULE } from "@/domain/sport-rules/futevolei.rule";
import {
  INTERLAJE_ATHLETICS_RULE,
  INTERLAJE_BASKETBALL_RULE,
  INTERLAJE_FUTSAL_RULE,
  INTERLAJE_HANDBALL_RULE,
  INTERLAJE_SWIMMING_RULE,
  INTERLAJE_VOLLEYBALL_RULE,
} from "@/domain/sport-rules/interlaje.rule";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";
import { ChampionshipCode } from "@/lib/enums";

export const CLV_PLATFORM_SPORT_RULES: PlatformSportRule[] = [
  BEACH_SOCCER_RULE,
  BEACH_TENNIS_RULE,
  FUTEVOLEI_RULE,
  BEACH_VOLLEYBALL_RULE,
];

export const SOCIETY_PLATFORM_SPORT_RULES: PlatformSportRule[] = [FUTEBOL_SOCIETY_RULE];

export const INTERLAJE_PLATFORM_SPORT_RULES: PlatformSportRule[] = [
  INTERLAJE_BASKETBALL_RULE,
  INTERLAJE_FUTSAL_RULE,
  INTERLAJE_HANDBALL_RULE,
  INTERLAJE_VOLLEYBALL_RULE,
  INTERLAJE_SWIMMING_RULE,
  INTERLAJE_ATHLETICS_RULE,
];

export const PLATFORM_SPORT_RULES_BY_CHAMPIONSHIP_CODE: Partial<Record<ChampionshipCode, PlatformSportRule[]>> = {
  [ChampionshipCode.CLV]: CLV_PLATFORM_SPORT_RULES,
  [ChampionshipCode.SOCIETY]: SOCIETY_PLATFORM_SPORT_RULES,
  [ChampionshipCode.INTERLAJE]: INTERLAJE_PLATFORM_SPORT_RULES,
};
