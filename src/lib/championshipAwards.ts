import { ChampionshipCode } from "@/lib/enums";
import { resolveNormalizedSportName } from "@/lib/championship";

const AWARDS_ENABLED_SPORTS_BY_CHAMPIONSHIP: Partial<Record<ChampionshipCode, Set<string>>> = {
  [ChampionshipCode.SOCIETY]: new Set(["futebol society"]),
};

export function resolveChampionshipSportSupportsAwards(
  championshipCode: ChampionshipCode,
  sportName: string | null | undefined,
) {
  const enabledSports = AWARDS_ENABLED_SPORTS_BY_CHAMPIONSHIP[championshipCode];

  if (!enabledSports) {
    return false;
  }

  return enabledSports.has(resolveNormalizedSportName(sportName));
}
