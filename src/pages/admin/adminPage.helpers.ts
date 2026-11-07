import { ChampionshipCode, ChampionshipStatus } from "@/lib/enums";
import { EMPTY_CHAMPIONSHIP_BRACKET_VIEW } from "@/lib/championship";
import type { Championship, ChampionshipBracketView } from "@/lib/types";

const CHAMPIONSHIP_SELECTION_ORDER: Record<ChampionshipCode, number> = {
  [ChampionshipCode.CLV]: 0,
  [ChampionshipCode.SOCIETY]: 1,
  [ChampionshipCode.INTERLAJE]: 2,
};

export function resolvePreferredAdminChampionshipCode(
  championships: Championship[],
): ChampionshipCode {
  const preferredChampionship = [...championships]
    .sort((firstChampionship, secondChampionship) => {
      return (
        CHAMPIONSHIP_SELECTION_ORDER[firstChampionship.code] -
        CHAMPIONSHIP_SELECTION_ORDER[secondChampionship.code]
      );
    })
    .find((championship) => championship.status != ChampionshipStatus.FINISHED);

  return preferredChampionship?.code ?? ChampionshipCode.CLV;
}

export function resolveVisibleOperationalChampionshipBracketView(
  championshipBracketView: ChampionshipBracketView,
  operationalMatchesCount: number,
): ChampionshipBracketView {
  if (
    operationalMatchesCount > 0 ||
    championshipBracketView.edition != null ||
    championshipBracketView.competitions.length > 0
  ) {
    return championshipBracketView;
  }

  return EMPTY_CHAMPIONSHIP_BRACKET_VIEW;
}
