import { BEACH_SOCCER_RULE } from "@/domain/sport-rules/beachSoccer.rule";
import { BEACH_TENNIS_RULE } from "@/domain/sport-rules/beachTennis.rule";
import { BEACH_VOLLEYBALL_RULE } from "@/domain/sport-rules/beachVolleyball.rule";
import { FUTEVOLEI_RULE } from "@/domain/sport-rules/futevolei.rule";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";

export const CLV_PLATFORM_SPORT_RULES: PlatformSportRule[] = [
  BEACH_SOCCER_RULE,
  BEACH_TENNIS_RULE,
  FUTEVOLEI_RULE,
  BEACH_VOLLEYBALL_RULE,
];
