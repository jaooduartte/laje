import type { Championship } from "@/lib/types";
import { ChampionshipCode, ChampionshipStatus } from "@/lib/enums";

const CHAMPIONSHIP_SELECTION_ORDER: Record<ChampionshipCode, number> = {
  [ChampionshipCode.CLV]: 0,
  [ChampionshipCode.SOCIETY]: 1,
  [ChampionshipCode.INTERLAJE]: 2,
};

export function resolvePreferredAdminChampionshipCode(championships: Championship[]): ChampionshipCode {
  const preferredChampionship = [...championships]
    .sort((firstChampionship, secondChampionship) => {
      return CHAMPIONSHIP_SELECTION_ORDER[firstChampionship.code] - CHAMPIONSHIP_SELECTION_ORDER[secondChampionship.code];
    })
    .find(
    (championship) => championship.status != ChampionshipStatus.FINISHED,
  );

  return preferredChampionship?.code ?? ChampionshipCode.CLV;
}
