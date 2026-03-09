import {
  AppBadgeTone,
  BracketEditionStatus,
  BracketPhase,
  BracketThirdPlaceMode,
  ChampionshipSportResultRule,
  ChampionshipSportNaipeMode,
  ChampionshipSportTieBreakerRule,
  ChampionshipCode,
  ChampionshipStatus,
  MatchStatus,
  MatchNaipe,
  TeamDivision,
  TeamDivisionSelection,
} from "@/lib/enums";
import type { ChampionshipBracketView } from "@/lib/types";

export interface MatchBracketContext {
  badgeLabel: string;
  phase: BracketPhase;
  seasonYear?: number | null;
  stageLabel: string;
  groupFilterValue?: string;
  groupLabel?: string;
}

export interface BracketGroupFilterOption {
  value: string;
  label: string;
}

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
  [ChampionshipStatus.PLANNING]: "Em breve",
  [ChampionshipStatus.UPCOMING]: "Configurando campeonato",
  [ChampionshipStatus.IN_PROGRESS]: "Em andamento",
  [ChampionshipStatus.FINISHED]: "Encerrado",
};

export const CHAMPIONSHIP_STATUS_BADGE_CLASS_NAMES: Record<ChampionshipStatus, string> = {
  [ChampionshipStatus.PLANNING]: "border-transparent bg-secondary text-secondary-foreground",
  [ChampionshipStatus.UPCOMING]: "border-transparent bg-secondary text-secondary-foreground",
  [ChampionshipStatus.IN_PROGRESS]:
    "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  [ChampionshipStatus.FINISHED]:
    "border-transparent bg-primary/10 text-primary dark:bg-primary/30 dark:text-primary-foreground",
};

export const MATCH_NAIPE_LABELS: Record<MatchNaipe, string> = {
  [MatchNaipe.MASCULINO]: "Masculino",
  [MatchNaipe.FEMININO]: "Feminino",
  [MatchNaipe.MISTO]: "Misto",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  [MatchStatus.SCHEDULED]: "Agendado",
  [MatchStatus.LIVE]: "Ao Vivo",
  [MatchStatus.FINISHED]: "Encerrado",
};

export const MATCH_STATUS_BADGE_TONES: Record<MatchStatus, AppBadgeTone> = {
  [MatchStatus.SCHEDULED]: AppBadgeTone.NEUTRAL,
  [MatchStatus.LIVE]: AppBadgeTone.PRIMARY,
  [MatchStatus.FINISHED]: AppBadgeTone.RED,
};

export const MATCH_NAIPE_BADGE_TONES: Record<MatchNaipe, AppBadgeTone> = {
  [MatchNaipe.MASCULINO]: AppBadgeTone.SKY,
  [MatchNaipe.FEMININO]: AppBadgeTone.RED,
  [MatchNaipe.MISTO]: AppBadgeTone.NEUTRAL,
};

export const TEAM_DIVISION_BADGE_TONES: Record<TeamDivision, AppBadgeTone> = {
  [TeamDivision.DIVISAO_PRINCIPAL]: AppBadgeTone.PRIMARY,
  [TeamDivision.DIVISAO_ACESSO]: AppBadgeTone.BLUE,
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

export const CHAMPIONSHIP_SPORT_RESULT_RULE_LABELS: Record<ChampionshipSportResultRule, string> = {
  [ChampionshipSportResultRule.POINTS]: "Por Pontos",
  [ChampionshipSportResultRule.SETS]: "Por Sets",
};

export const BRACKET_PHASE_LABELS: Record<BracketPhase, string> = {
  [BracketPhase.GROUP_STAGE]: "Fase de Grupos",
  [BracketPhase.KNOCKOUT]: "Mata-mata",
};

export const BRACKET_EDITION_STATUS_LABELS: Record<BracketEditionStatus, string> = {
  [BracketEditionStatus.DRAFT]: "Rascunho",
  [BracketEditionStatus.GROUPS_GENERATED]: "Grupos Gerados",
  [BracketEditionStatus.KNOCKOUT_GENERATED]: "Mata-mata Gerado",
};

export const BRACKET_THIRD_PLACE_MODE_LABELS: Record<BracketThirdPlaceMode, string> = {
  [BracketThirdPlaceMode.NONE]: "Sem 3º lugar",
  [BracketThirdPlaceMode.MATCH]: "Disputa de 3º lugar",
  [BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER]: "3º lugar herdado da semi do campeão",
};

export function resolveKnockoutRoundLabel(
  roundNumber: number,
  totalRounds: number,
  isThirdPlace = false,
): string {
  if (isThirdPlace) {
    return "3º lugar";
  }

  const remainingRounds = totalRounds - roundNumber;

  if (remainingRounds <= 0) {
    return "Final";
  }

  if (remainingRounds == 1) {
    return "Semifinal";
  }

  if (remainingRounds == 2) {
    return "Quartas de final";
  }

  if (remainingRounds == 3) {
    return "Oitavas de final";
  }

  return `${2 ** remainingRounds} avos de final`;
}

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

export function resolveMatchNaipeBadgeTone(naipe: string): AppBadgeTone {
  if (isMatchNaipe(naipe)) {
    return MATCH_NAIPE_BADGE_TONES[naipe];
  }

  return AppBadgeTone.NEUTRAL;
}

export function resolveMatchNaipeLabel(naipe: string): string {
  if (isMatchNaipe(naipe)) {
    return MATCH_NAIPE_LABELS[naipe];
  }

  return naipe.trim() ? naipe : "Naipe";
}

export function resolveMatchStatusBadgeTone(status: MatchStatus): AppBadgeTone {
  return MATCH_STATUS_BADGE_TONES[status];
}

export function resolveMatchStatusLabel(status: MatchStatus): string {
  return MATCH_STATUS_LABELS[status];
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

export function isChampionshipSportResultRule(value: string): value is ChampionshipSportResultRule {
  return value === ChampionshipSportResultRule.POINTS || value === ChampionshipSportResultRule.SETS;
}

export function isBracketThirdPlaceMode(value: string): value is BracketThirdPlaceMode {
  return (
    value === BracketThirdPlaceMode.NONE ||
    value === BracketThirdPlaceMode.MATCH ||
    value === BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER
  );
}

export function resolveMatchBracketContextByMatchId(
  championshipBracketView: ChampionshipBracketView,
  seasonYear?: number | null,
): Record<string, MatchBracketContext> {
  return championshipBracketView.competitions.reduce<Record<string, MatchBracketContext>>((matchContextById, competition) => {
    const divisionLabel = competition.division ? TEAM_DIVISION_LABELS[competition.division] : "Sem divisão";
    const seasonYearLabel = typeof seasonYear == "number" ? ` • ${seasonYear}` : "";
    const knockoutTotalRounds = competition.knockout_matches.reduce((currentTotalRounds, knockoutMatch) => {
      if (knockoutMatch.is_third_place) {
        return currentTotalRounds;
      }

      return Math.max(currentTotalRounds, knockoutMatch.round_number);
    }, 0);

    competition.groups.forEach((group) => {
      const groupLabel = `${competition.sport_name} • ${MATCH_NAIPE_LABELS[competition.naipe]} • ${divisionLabel}${seasonYearLabel} • Chave ${group.group_number}`;
      const groupFilterValue = `${competition.id}:${group.id}`;
      const badgeLabel = `Chave ${group.group_number}`;

      group.matches.forEach((groupMatch) => {
        if (!groupMatch.match_id) {
          return;
        }

        matchContextById[groupMatch.match_id] = {
          badgeLabel,
          phase: BracketPhase.GROUP_STAGE,
          seasonYear,
          stageLabel: groupLabel,
          groupFilterValue,
          groupLabel,
        };
      });
    });

    competition.knockout_matches.forEach((knockoutMatch) => {
      if (!knockoutMatch.match_id) {
        return;
      }

      const badgeLabel = resolveKnockoutRoundLabel(
        knockoutMatch.round_number,
        Math.max(knockoutTotalRounds, knockoutMatch.round_number),
        knockoutMatch.is_third_place,
      );

      matchContextById[knockoutMatch.match_id] = {
        badgeLabel,
        phase: BracketPhase.KNOCKOUT,
        seasonYear,
        stageLabel: `${competition.sport_name} • ${MATCH_NAIPE_LABELS[competition.naipe]} • ${divisionLabel}${seasonYearLabel} • ${badgeLabel}`,
      };
    });

    return matchContextById;
  }, {});
}

export function resolveBracketGroupFilterOptions(
  matchBracketContextByMatchId: Record<string, MatchBracketContext>,
): BracketGroupFilterOption[] {
  const groupOptionsByValue = new Map<string, string>();

  Object.values(matchBracketContextByMatchId).forEach((matchBracketContext) => {
    if (!matchBracketContext.groupFilterValue || !matchBracketContext.groupLabel) {
      return;
    }

    groupOptionsByValue.set(matchBracketContext.groupFilterValue, matchBracketContext.groupLabel);
  });

  return [...groupOptionsByValue.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((firstGroupOption, secondGroupOption) => firstGroupOption.label.localeCompare(secondGroupOption.label));
}
