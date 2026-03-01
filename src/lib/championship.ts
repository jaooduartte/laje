import {
  ChampionshipSportNaipeMode,
  ChampionshipSportTieBreakerRule,
  ChampionshipCode,
  ChampionshipStatus,
  MatchNaipe,
  TeamDivision,
  TeamDivisionSelection,
} from "@/lib/enums";

export const TEAM_DIVISION_LABELS: Record<TeamDivision, string> = {
  [TeamDivision.DIVISAO_PRINCIPAL]: "Divisão Principal",
  [TeamDivision.DIVISAO_ACESSO]: "Divisão de Acesso",
};

export const TEAM_DIVISION_SELECTION_LABELS: Record<TeamDivisionSelection, string> = {
  [TeamDivisionSelection.DIVISAO_PRINCIPAL]: TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL],
  [TeamDivisionSelection.DIVISAO_ACESSO]: TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO],
  [TeamDivisionSelection.WITHOUT_DIVISION]: "Sem divisão (somente eventos)",
};

export const CHAMPIONSHIP_STATUS_LABELS: Record<ChampionshipStatus, string> = {
  [ChampionshipStatus.PLANNING]: "Em planejamento",
  [ChampionshipStatus.UPCOMING]: "Em breve",
  [ChampionshipStatus.IN_PROGRESS]: "Em andamento",
  [ChampionshipStatus.FINISHED]: "Encerrado",
};

export const CHAMPIONSHIP_STATUS_BADGE_CLASS_NAMES: Record<ChampionshipStatus, string> = {
  [ChampionshipStatus.PLANNING]: "border-transparent bg-secondary text-secondary-foreground",
  [ChampionshipStatus.UPCOMING]: "border-transparent bg-secondary text-secondary-foreground",
  [ChampionshipStatus.IN_PROGRESS]: "border-transparent bg-emerald-100 text-emerald-700",
  [ChampionshipStatus.FINISHED]: "border-transparent bg-primary/15 text-primary",
};

export const MATCH_NAIPE_LABELS: Record<MatchNaipe, string> = {
  [MatchNaipe.MASCULINO]: "Masculino",
  [MatchNaipe.FEMININO]: "Feminino",
  [MatchNaipe.MISTO]: "Misto",
};

export const MATCH_NAIPE_BADGE_CLASS_NAMES: Record<MatchNaipe, string> = {
  [MatchNaipe.MASCULINO]: "border-transparent bg-sky-100 text-sky-700",
  [MatchNaipe.FEMININO]: "border-transparent bg-rose-100 text-rose-700",
  [MatchNaipe.MISTO]: "border-transparent bg-secondary text-secondary-foreground",
};

export const CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS: Record<ChampionshipSportNaipeMode, string> = {
  [ChampionshipSportNaipeMode.MISTO]: "Mista",
  [ChampionshipSportNaipeMode.MASCULINO_FEMININO]: "Masculino e Feminino",
};

export const CHAMPIONSHIP_SPORT_TIE_BREAKER_RULE_LABELS: Record<ChampionshipSportTieBreakerRule, string> = {
  [ChampionshipSportTieBreakerRule.STANDARD]: "Padrão",
  [ChampionshipSportTieBreakerRule.POINTS_AVERAGE]: "Pontos Average",
  [ChampionshipSportTieBreakerRule.BEACH_SOCCER]: "Beach Soccer",
  [ChampionshipSportTieBreakerRule.BEACH_TENNIS]: "Beach Tennis",
};

export function isTeamDivision(value: string): value is TeamDivision {
  return value === TeamDivision.DIVISAO_PRINCIPAL || value === TeamDivision.DIVISAO_ACESSO;
}

export function isTeamDivisionSelection(value: string): value is TeamDivisionSelection {
  return (
    value === TeamDivisionSelection.DIVISAO_PRINCIPAL ||
    value === TeamDivisionSelection.DIVISAO_ACESSO ||
    value === TeamDivisionSelection.WITHOUT_DIVISION
  );
}

export function isMatchNaipe(value: string): value is MatchNaipe {
  return value === MatchNaipe.MASCULINO || value === MatchNaipe.FEMININO || value === MatchNaipe.MISTO;
}

export function isChampionshipSportNaipeMode(value: string): value is ChampionshipSportNaipeMode {
  return value === ChampionshipSportNaipeMode.MISTO || value === ChampionshipSportNaipeMode.MASCULINO_FEMININO;
}

export function doesChampionshipSportSupportNaipe(
  naipeMode: ChampionshipSportNaipeMode,
  naipe: MatchNaipe,
): boolean {
  if (naipeMode === ChampionshipSportNaipeMode.MISTO) {
    return naipe === MatchNaipe.MISTO;
  }

  return naipe === MatchNaipe.MASCULINO || naipe === MatchNaipe.FEMININO;
}

export function isChampionshipStatus(value: string): value is ChampionshipStatus {
  return (
    value === ChampionshipStatus.PLANNING ||
    value === ChampionshipStatus.UPCOMING ||
    value === ChampionshipStatus.IN_PROGRESS ||
    value === ChampionshipStatus.FINISHED
  );
}

export function isChampionshipCode(value: string): value is ChampionshipCode {
  return (
    value === ChampionshipCode.CLV ||
    value === ChampionshipCode.SOCIETY ||
    value === ChampionshipCode.INTERLAJE
  );
}
