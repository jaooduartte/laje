import { useEffect, useState } from "react";
import { ChampionshipCode } from "@/lib/enums";

const SELECTED_CHAMPIONSHIP_STORAGE_KEY = "selected_championship_code";

export function useSelectedChampionship() {
  const [selectedChampionshipCode, setSelectedChampionshipCode] = useState<ChampionshipCode>(() => {
    if (typeof window === "undefined") {
      return ChampionshipCode.CLV;
    }

    const storedChampionshipCode = localStorage.getItem(SELECTED_CHAMPIONSHIP_STORAGE_KEY);

    if (
      storedChampionshipCode === ChampionshipCode.CLV ||
      storedChampionshipCode === ChampionshipCode.SOCIETY ||
      storedChampionshipCode === ChampionshipCode.INTERLAJE
    ) {
      return storedChampionshipCode;
    }

    return ChampionshipCode.CLV;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(SELECTED_CHAMPIONSHIP_STORAGE_KEY, selectedChampionshipCode);
  }, [selectedChampionshipCode]);

  return {
    selectedChampionshipCode,
    setSelectedChampionshipCode,
  };
}
