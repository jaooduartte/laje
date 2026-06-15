import type { ChampionshipBracketCompetitionConfigDraft } from "@/domain/championship-brackets/championshipBracket.types";

export type QualificationModeOption = "FIRST_ONLY_SMART" | "FIRST_ONLY_EXPANDED" | "TOP_TWO";

export const QUALIFICATION_MODE_OPTIONS: Array<{
  value: QualificationModeOption;
  label: string;
  helper: string;
}> = [
  {
    value: "FIRST_ONLY_SMART",
    label: "Só 1º por grupo (completa só se precisar)",
    helper:
      "Ex.: 4 grupos = 4 vagas (4 melhores 1º). Se forem 3 grupos, fecha 4 vagas com 3 melhores 1º + 1 melhor 2º.",
  },
  {
    value: "FIRST_ONLY_EXPANDED",
    label: "1º por grupo + melhores 2º",
    helper: "Ex.: 4 grupos = 8 vagas (4 melhores 1º + 4 melhores 2º).",
  },
  {
    value: "TOP_TWO",
    label: "1º e 2º por grupo",
    helper: "Ex.: 4 grupos = 8 vagas (1º e 2º de cada grupo).",
  },
];

export function resolveQualificationModeOption(
  config: Pick<
    ChampionshipBracketCompetitionConfigDraft,
    "qualifiers_per_group" | "should_complete_knockout_with_best_second_placed_teams"
  >,
): QualificationModeOption {
  if (config.qualifiers_per_group == 2) {
    return "TOP_TWO";
  }

  return config.should_complete_knockout_with_best_second_placed_teams
    ? "FIRST_ONLY_EXPANDED"
    : "FIRST_ONLY_SMART";
}

export function resolveCompetitionConfigByQualificationMode<
  T extends Pick<
    ChampionshipBracketCompetitionConfigDraft,
    "qualifiers_per_group" | "should_complete_knockout_with_best_second_placed_teams"
  >,
>(currentConfig: T, mode: QualificationModeOption): T {
  if (mode == "TOP_TWO") {
    return {
      ...currentConfig,
      qualifiers_per_group: 2,
      should_complete_knockout_with_best_second_placed_teams: false,
    };
  }

  return {
    ...currentConfig,
    qualifiers_per_group: 1,
    should_complete_knockout_with_best_second_placed_teams: mode == "FIRST_ONLY_EXPANDED",
  };
}
