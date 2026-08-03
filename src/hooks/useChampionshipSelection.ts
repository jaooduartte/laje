import { useEffect, useMemo } from "react";
import { useChampionshipSeasonRuntime } from "@/hooks/useChampionshipSeasonRuntime";
import type { Championship } from "@/lib/types";
import { isChampionshipCode } from "@/lib/championship";
import type { ChampionshipCode } from "@/lib/enums";

interface UseChampionshipSelectionOptions {
  championships: Championship[];
  selectedChampionshipCode: ChampionshipCode;
  setSelectedChampionshipCode: (value: ChampionshipCode) => void;
}

export function useChampionshipSelection({
  championships,
  selectedChampionshipCode,
  setSelectedChampionshipCode,
}: UseChampionshipSelectionOptions) {
  const selectedChampionship = useMemo(() => {
    return championships.find((championship) => championship.code == selectedChampionshipCode) ?? null;
  }, [championships, selectedChampionshipCode]);
  const { usesDivisions: selectedChampionshipHasDivisions } = useChampionshipSeasonRuntime({
    championship: selectedChampionship,
    seasonYear: selectedChampionship?.current_season_year ?? null,
  });

  useEffect(() => {
    if (championships.length == 0) {
      return;
    }

    const selectedChampionshipExists = championships.some(
      (championship) => championship.code == selectedChampionshipCode,
    );

    if (!selectedChampionshipExists) {
      setSelectedChampionshipCode(championships[0].code);
    }
  }, [championships, selectedChampionshipCode, setSelectedChampionshipCode]);

  const handleChampionshipCodeChange = (value: string) => {
    if (isChampionshipCode(value)) {
      setSelectedChampionshipCode(value);
    }
  };

  return {
    selectedChampionship,
    selectedChampionshipId: selectedChampionship?.id ?? null,
    selectedChampionshipHasDivisions,
    handleChampionshipCodeChange,
  };
}
