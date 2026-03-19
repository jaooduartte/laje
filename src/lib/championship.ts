import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";
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
import type { ChampionshipBracketView, Match } from "@/lib/types";

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

export interface ChampionshipBracketGroupStageOption {
  value: string;
  competition_id: string;
  group_id: string;
  group_number: number;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  label: string;
  team_ids: string[];
}

export interface GroupStageMatchBracketBinding {
  competition_id: string;
  group_id: string;
  group_number: number;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  team_ids: string[];
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

export const EMPTY_CHAMPIONSHIP_BRACKET_VIEW: ChampionshipBracketView = {
  edition: null,
  competitions: [],
};

function resolveAlphabeticalGroupSuffix(groupNumber: number): string {
  const safeGroupNumber = Number.isFinite(groupNumber) ? Math.max(1, Math.trunc(groupNumber)) : 1;
  let alphabeticalGroupSuffix = "";
  let remainingGroupNumber = safeGroupNumber;

  while (remainingGroupNumber > 0) {
    remainingGroupNumber -= 1;
    alphabeticalGroupSuffix = String.fromCharCode(65 + (remainingGroupNumber % 26)) + alphabeticalGroupSuffix;
    remainingGroupNumber = Math.floor(remainingGroupNumber / 26);
  }

  return alphabeticalGroupSuffix;
}

export function resolveChampionshipGroupLabel(groupNumber: number): string {
  return `Grupo ${resolveAlphabeticalGroupSuffix(groupNumber)}`;
}

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

export function resolveMatchDisplaySlotValue(match: Match & { scheduled_slot?: number | null }) {
  return match.queue_position ?? match.scheduled_slot ?? Number.MAX_SAFE_INTEGER;
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

export function resolveMatchScheduledDateValue(match: {
  scheduled_date: string | null;
  start_time: string | null;
}): string | null {
  if (match.scheduled_date) {
    return match.scheduled_date;
  }

  if (match.start_time) {
    return match.start_time.slice(0, 10);
  }

  return null;
}

export function resolveMatchQueueLabel(queuePosition: number | null): string {
  if (typeof queuePosition == "number" && Number.isFinite(queuePosition) && queuePosition > 0) {
    return `Jogo ${queuePosition}`;
  }

  return "Fila do dia";
}

export function resolveMatchCompetitionKey(match: {
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null | undefined;
}): string {
  return `${match.sport_id}:${match.naipe}:${match.division ?? "WITHOUT_DIVISION"}`;
}

export function resolveNextScheduledMatchesByCompetition<
  MatchItem extends {
    sport_id: string;
    naipe: MatchNaipe;
    division: TeamDivision | null | undefined;
  },
>(scheduledMatches: MatchItem[]): MatchItem[] {
  const competitionKeySet = new Set<string>();

  return scheduledMatches.filter((scheduledMatch) => {
    const competitionKey = resolveMatchCompetitionKey(scheduledMatch);

    if (competitionKeySet.has(competitionKey)) {
      return false;
    }

    competitionKeySet.add(competitionKey);
    return true;
  });
}

export function resolveInterleavedScheduledMatchesByCompetition<
  MatchItem extends {
    sport_id: string;
    naipe: MatchNaipe;
    division: TeamDivision | null | undefined;
    scheduled_date: string | null;
    start_time: string | null;
  },
>(scheduledMatches: MatchItem[]): MatchItem[] {
  const scheduledMatchesByDate = scheduledMatches.reduce<Record<string, MatchItem[]>>((carry, scheduledMatch) => {
    const scheduledDateValue = resolveMatchScheduledDateValue(scheduledMatch);

    if (!scheduledDateValue) {
      return carry;
    }

    carry[scheduledDateValue] = [...(carry[scheduledDateValue] ?? []), scheduledMatch];
    return carry;
  }, {});

  return Object.keys(scheduledMatchesByDate)
    .sort((firstDate, secondDate) => firstDate.localeCompare(secondDate))
    .flatMap((scheduledDateValue) => {
      const currentDateMatches = scheduledMatchesByDate[scheduledDateValue];
      const uniqueSportIds = new Set(currentDateMatches.map((scheduledMatch) => scheduledMatch.sport_id));

      if (uniqueSportIds.size <= 1) {
        return currentDateMatches;
      }

      const competitionMatchesByKey = new Map<string, MatchItem[]>();
      const orderedCompetitionKeys: string[] = [];

      currentDateMatches.forEach((scheduledMatch) => {
        const competitionKey = resolveMatchCompetitionKey(scheduledMatch);

        if (!competitionMatchesByKey.has(competitionKey)) {
          competitionMatchesByKey.set(competitionKey, []);
          orderedCompetitionKeys.push(competitionKey);
        }

        competitionMatchesByKey.get(competitionKey)?.push(scheduledMatch);
      });

      const interleavedMatches: MatchItem[] = [];
      let hasPendingCompetitionMatches = true;

      while (hasPendingCompetitionMatches) {
        hasPendingCompetitionMatches = false;

        orderedCompetitionKeys.forEach((competitionKey) => {
          const competitionMatches = competitionMatchesByKey.get(competitionKey) ?? [];
          const nextMatch = competitionMatches.shift();

          if (!nextMatch) {
            return;
          }

          interleavedMatches.push(nextMatch);
          hasPendingCompetitionMatches = hasPendingCompetitionMatches || competitionMatches.length > 0;
        });
      }

      return interleavedMatches;
    });
}

export function resolveMatchStartedAtLabel(startTime: string | null): string | null {
  if (!startTime) {
    return null;
  }

  return `Jogo iniciado às ${format(new Date(startTime), "HH:mm", { locale: ptBR })}`;
}

export function resolveMatchTieBreakRuleLabel(
  tieBreakerRule: ChampionshipSportTieBreakerRule | null | undefined,
): string | null {
  if (!tieBreakerRule) {
    return null;
  }

  return CHAMPIONSHIP_SPORT_TIE_BREAKER_RULE_LABELS[tieBreakerRule];
}

export function isRecordedMatchSet(matchSet: MatchSetInput | null | undefined): matchSet is MatchSetInput {
  if (!matchSet) {
    return false;
  }

  return (
    typeof matchSet.set_number == "number" &&
    typeof matchSet.home_points == "number" &&
    typeof matchSet.away_points == "number" &&
    (matchSet.home_points > 0 || matchSet.away_points > 0) &&
    matchSet.home_points != matchSet.away_points
  );
}

export function resolveRecordedMatchSets(match: Pick<Match, "match_sets">): MatchSetInput[] {
  return (match.match_sets ?? [])
    .filter((matchSet): matchSet is MatchSetInput => isRecordedMatchSet(matchSet))
    .sort((firstMatchSet, secondMatchSet) => firstMatchSet.set_number - secondMatchSet.set_number);
}

export function resolveMatchSetSummary(match: Pick<Match, "match_sets" | "home_team" | "away_team">) {
  const homeTeamName = match.home_team?.name ?? "Mandante";
  const awayTeamName = match.away_team?.name ?? "Visitante";

  return resolveRecordedMatchSets(match)
    .map((matchSet) => ({
      setNumber: matchSet.set_number,
      text: `Set ${matchSet.set_number}: ${homeTeamName} ${matchSet.home_points} × ${matchSet.away_points} ${awayTeamName}`,
    }));
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
      const championshipGroupLabel = resolveChampionshipGroupLabel(group.group_number);
      const groupLabel = `${competition.sport_name} • ${MATCH_NAIPE_LABELS[competition.naipe]} • ${divisionLabel}${seasonYearLabel} • ${championshipGroupLabel}`;
      const groupFilterValue = `${competition.id}:${group.id}`;
      const badgeLabel = championshipGroupLabel;

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

export function resolveChampionshipBracketGroupStageOptions(
  championshipBracketView: ChampionshipBracketView,
): ChampionshipBracketGroupStageOption[] {
  return championshipBracketView.competitions
    .flatMap((competition) => {
      const divisionLabel = competition.division ? TEAM_DIVISION_LABELS[competition.division] : "Sem divisão";

      return competition.groups.map((group) => ({
        value: `${competition.id}:${group.id}`,
        competition_id: competition.id,
        group_id: group.id,
        group_number: group.group_number,
        sport_id: competition.sport_id,
        sport_name: competition.sport_name,
        naipe: competition.naipe,
        division: competition.division,
        label: `${competition.sport_name} • ${MATCH_NAIPE_LABELS[competition.naipe]} • ${divisionLabel} • ${resolveChampionshipGroupLabel(group.group_number)}`,
        team_ids: group.teams.map((team) => team.team_id),
      }));
    })
    .sort((firstGroupOption, secondGroupOption) => firstGroupOption.label.localeCompare(secondGroupOption.label));
}

export function resolveGroupStageMatchBindingByMatchId(
  championshipBracketView: ChampionshipBracketView,
): Record<string, GroupStageMatchBracketBinding> {
  return championshipBracketView.competitions.reduce<Record<string, GroupStageMatchBracketBinding>>((carry, competition) => {
    competition.groups.forEach((group) => {
      const team_ids = group.teams.map((team) => team.team_id);

      group.matches.forEach((groupMatch) => {
        if (!groupMatch.match_id) {
          return;
        }

        carry[groupMatch.match_id] = {
          competition_id: competition.id,
          group_id: group.id,
          group_number: group.group_number,
          sport_id: competition.sport_id,
          sport_name: competition.sport_name,
          naipe: competition.naipe,
          division: competition.division,
          team_ids,
        };
      });
    });

    return carry;
  }, {});
}
