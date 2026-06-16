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
  ThemeTimeZone,
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
  [MatchStatus.SCHEDULED]: AppBadgeTone.SILVER,
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
  [ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY]: "Futebol Society",
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

const MATCH_REPRESENTATION_COORDINATION_LABEL = "CO";
const MATCH_REPRESENTATION_TO_BE_DEFINED_LABEL = "A definir";
const NORMALIZED_BEACH_SOCCER_NAME = "beach soccer";
const MATCH_DISPLAY_TIME_ZONE = ThemeTimeZone.SAO_PAULO;

export interface MatchEstimatedStartTimeChampionshipSport {
  championship_id: string;
  sport_id: string;
  default_match_duration_minutes: number;
  show_estimated_start_time_on_cards: boolean;
}

export interface MatchEstimatedStartTimeBracketEdition {
  championship_id: string;
  season_year: number;
  payload_snapshot: Record<string, unknown> | null;
  schedule_days?: MatchEstimatedStartTimeScheduleDay[];
}

export interface MatchEstimatedStartTimeBreak {
  break_start_time: string;
  break_end_time: string;
  position: number;
}

export interface MatchEstimatedStartTimeScheduleDay {
  date: string;
  start_time: string;
  end_time: string;
  breaks?: MatchEstimatedStartTimeBreak[];
}

const MATCH_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: MATCH_DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const MATCH_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: MATCH_DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

export type MatchRepresentationSource = Pick<
  Match,
  | "id"
  | "championship_id"
  | "location"
  | "court_name"
  | "season_year"
  | "scheduled_date"
  | "start_time"
  | "status"
  | "sport_id"
  | "naipe"
  | "division"
  | "queue_position"
  | "created_at"
> & {
  scheduled_slot?: number | null;
  end_time?: Match["end_time"] | null;
  sports?: Match["sports"];
  home_team?: Match["home_team"];
  away_team?: Match["away_team"];
};

export function resolveMatchDisplaySlotValue(
  match: Pick<Match, "queue_position"> & { scheduled_slot?: number | null },
) {
  return match.queue_position ?? match.scheduled_slot ?? Number.MAX_SAFE_INTEGER;
}

function resolveMatchVisualCourtScopeKey(match: MatchRepresentationSource): string {
  return [
    match.championship_id,
    String(match.season_year),
    match.location.trim(),
    (match.court_name ?? "").trim() || "WITHOUT_COURT_NAME",
  ].join(":");
}

function resolveMatchRepresentationFromPreviousMatch(match: MatchRepresentationSource | undefined): string {
  if (!match) {
    return MATCH_REPRESENTATION_COORDINATION_LABEL;
  }

  const previousHomeTeamName = match.home_team?.name.trim();
  const previousAwayTeamName = match.away_team?.name.trim();

  if (!previousHomeTeamName || !previousAwayTeamName) {
    return MATCH_REPRESENTATION_TO_BE_DEFINED_LABEL;
  }

  return `${previousHomeTeamName} x ${previousAwayTeamName}`;
}

function doMatchRepresentationSourcesShareAnyTeam(
  firstMatch: Pick<MatchRepresentationSource, "home_team" | "away_team">,
  secondMatch: Pick<MatchRepresentationSource, "home_team" | "away_team">,
): boolean {
  const firstTeamIds = [firstMatch.home_team?.id, firstMatch.away_team?.id].filter(Boolean);
  const secondTeamIds = new Set([secondMatch.home_team?.id, secondMatch.away_team?.id].filter(Boolean));

  return firstTeamIds.some((teamId) => secondTeamIds.has(teamId));
}

function resolveMatchRepresentationForVisualCourtSequence(
  currentMatch: MatchRepresentationSource,
  previousMatch: MatchRepresentationSource | undefined,
): string {
  const currentScheduledDate = resolveMatchScheduledDateValue(currentMatch);
  const previousScheduledDate = previousMatch ? resolveMatchScheduledDateValue(previousMatch) : null;

  if (!previousMatch || currentScheduledDate != previousScheduledDate) {
    return MATCH_REPRESENTATION_COORDINATION_LABEL;
  }

  if (doMatchRepresentationSourcesShareAnyTeam(previousMatch, currentMatch)) {
    return MATCH_REPRESENTATION_COORDINATION_LABEL;
  }

  return resolveMatchRepresentationFromPreviousMatch(previousMatch);
}

function resolveUniqueMatchSourcesById<MatchSource extends { id: string }>(matchSources: MatchSource[]): MatchSource[] {
  const matchSourceById = matchSources.reduce<Record<string, MatchSource>>((carry, matchSource) => {
    carry[matchSource.id] = matchSource;
    return carry;
  }, {});

  return Object.values(matchSourceById);
}

function resolveMatchVisualCourtTimeSortValue(
  match: MatchRepresentationSource,
  estimatedStartTimeByMatchId?: Record<string, string>,
): number | null {
  const plannedStartTimeLabel = resolveSaoPauloTimeLabel(match.start_time ?? "");
  const estimatedStartTimeLabel = estimatedStartTimeByMatchId?.[match.id];

  return resolveTimeValueToMinutes(plannedStartTimeLabel ?? estimatedStartTimeLabel ?? null);
}

function compareMatchVisualCourtOrder(
  firstMatch: MatchRepresentationSource,
  secondMatch: MatchRepresentationSource,
  estimatedStartTimeByMatchId?: Record<string, string>,
) {
  const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
  const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

  if (firstScheduledDate != secondScheduledDate) {
    return firstScheduledDate.localeCompare(secondScheduledDate);
  }

  const firstVisualTimeSortValue = resolveMatchVisualCourtTimeSortValue(firstMatch, estimatedStartTimeByMatchId);
  const secondVisualTimeSortValue = resolveMatchVisualCourtTimeSortValue(secondMatch, estimatedStartTimeByMatchId);

  if (firstVisualTimeSortValue != null && secondVisualTimeSortValue != null && firstVisualTimeSortValue != secondVisualTimeSortValue) {
    return firstVisualTimeSortValue - secondVisualTimeSortValue;
  }

  if (firstVisualTimeSortValue != null && secondVisualTimeSortValue == null) {
    return -1;
  }

  if (firstVisualTimeSortValue == null && secondVisualTimeSortValue != null) {
    return 1;
  }

  const slotDifference = resolveMatchDisplaySlotValue(firstMatch) - resolveMatchDisplaySlotValue(secondMatch);

  if (slotDifference != 0) {
    return slotDifference;
  }

  if (firstMatch.created_at != secondMatch.created_at) {
    return firstMatch.created_at.localeCompare(secondMatch.created_at);
  }

  return firstMatch.id.localeCompare(secondMatch.id);
}
function resolveOrderedVisualCourtMatches(
  matches: MatchRepresentationSource[],
  estimatedStartTimeByMatchId?: Record<string, string>,
  options?: {
    scheduledOnly?: boolean;
  },
): Record<string, MatchRepresentationSource[]> {
  return matches
    .filter((match) => {
      return (
        (!options?.scheduledOnly || match.status === MatchStatus.SCHEDULED) &&
        resolveMatchScheduledDateValue(match) != null &&
        match.location.trim() &&
        (match.court_name ?? "").trim()
      );
    })
    .reduce<Record<string, MatchRepresentationSource[]>>((carry, match) => {
    const scopeKey = resolveMatchVisualCourtScopeKey(match);

    carry[scopeKey] = [...(carry[scopeKey] ?? []), match].sort((firstMatch, secondMatch) =>
      compareMatchVisualCourtOrder(firstMatch, secondMatch, estimatedStartTimeByMatchId),
    );
    return carry;
    }, {});
}

export function resolveVisualQueuePositionByMatchId(
  matches: MatchRepresentationSource[],
  contextMatches?: MatchRepresentationSource[],
  estimatedStartTimeByMatchId?: Record<string, string>,
): Record<string, number> {
  if (matches.length == 0) {
    return {};
  }

  const visualCourtMatchesByScopeKey = resolveOrderedVisualCourtMatches(
    resolveUniqueMatchSourcesById([...(contextMatches ?? []), ...matches]),
    estimatedStartTimeByMatchId,
    { scheduledOnly: true },
  );

  const visualQueuePositionByMatchId = Object.values(visualCourtMatchesByScopeKey).reduce<Record<string, number>>(
    (carry, scopedMatches) => {
      scopedMatches.forEach((match, matchIndex) => {
        carry[match.id] = matchIndex + 1;
      });

      return carry;
    },
    {},
  );

  return matches.reduce<Record<string, number>>((carry, match) => {
    const visualQueuePosition = visualQueuePositionByMatchId[match.id];

    if (typeof visualQueuePosition == "number") {
      carry[match.id] = visualQueuePosition;
    }

    return carry;
  }, {});
}

export function resolveVisualCourtMatchRepresentationByMatchId(
  matches: MatchRepresentationSource[],
  contextMatches?: MatchRepresentationSource[],
  estimatedStartTimeByMatchId?: Record<string, string>,
): Record<string, string> {
  if (matches.length == 0) {
    return {};
  }

  const visualCourtMatchesByScopeKey = resolveOrderedVisualCourtMatches(
    resolveUniqueMatchSourcesById([...(contextMatches ?? []), ...matches]),
    estimatedStartTimeByMatchId,
  );

  const matchRepresentationByMatchId = Object.values(visualCourtMatchesByScopeKey).reduce<Record<string, string>>(
    (carry, scopedMatches) => {
      scopedMatches.forEach((match, matchIndex) => {
        carry[match.id] = resolveMatchRepresentationForVisualCourtSequence(match, scopedMatches[matchIndex - 1]);
      });

      return carry;
    },
    {},
  );

  return matches.reduce<Record<string, string>>((carry, match) => {
    const matchRepresentation = matchRepresentationByMatchId[match.id];

    if (matchRepresentation) {
      carry[match.id] = matchRepresentation;
    }

    return carry;
  }, {});
}

export function resolveMatchRepresentationByMatchId(
  matches: MatchRepresentationSource[],
  contextMatches?: MatchRepresentationSource[],
  estimatedStartTimeByMatchId?: Record<string, string>,
): Record<string, string> {
  return resolveVisualCourtMatchRepresentationByMatchId(matches, contextMatches, estimatedStartTimeByMatchId);
}

export function resolveNormalizedSportName(sportName: string | null | undefined): string {
  if (!sportName) {
    return "";
  }

  return sportName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveTimeValueToMinutes(timeValue: string | null | undefined): number | null {
  if (!timeValue) {
    return null;
  }

  const [hourPart, minutePart] = timeValue
    .split(":")
    .slice(0, 2)
    .map((part) => Number(part));

  if (Number.isNaN(hourPart) || Number.isNaN(minutePart)) {
    return null;
  }

  if (hourPart < 0 || hourPart > 23 || minutePart < 0 || minutePart > 59) {
    return null;
  }

  return hourPart * 60 + minutePart;
}

function resolveMinutesToTimeLabel(totalMinutes: number): string {
  const normalizedTotalMinutes = Math.max(0, Math.trunc(totalMinutes));
  const hourValue = Math.floor(normalizedTotalMinutes / 60) % 24;
  const minuteValue = normalizedTotalMinutes % 60;

  return `${hourValue.toString().padStart(2, "0")}:${minuteValue.toString().padStart(2, "0")}`;
}

function resolveEstimatedSlotStartMinutes(params: {
  dayStartMinutes: number;
  dayEndMinutes: number;
  slotPosition: number;
  matchDurationMinutes: number;
  breaks: Array<{ startMinutes: number; endMinutes: number }>;
}): number | null {
  const { dayStartMinutes, dayEndMinutes, slotPosition, matchDurationMinutes, breaks } = params;

  if (slotPosition < 1 || matchDurationMinutes <= 0) {
    return null;
  }

  // Avança o início até um ponto onde [start, start+duration] não cruza nem começa dentro de nenhum intervalo.
  // Iterativo para cobrir casos de intervalos consecutivos ou adjacentes.
  function findValidSlotStart(start: number): number {
    let current = start;
    let changed = true;
    while (changed) {
      changed = false;
      for (const brk of breaks) {
        if (current < brk.endMinutes && current + matchDurationMinutes > brk.startMinutes) {
          current = brk.endMinutes;
          changed = true;
        }
      }
    }
    return current;
  }

  let currentSlotStartMinutes = findValidSlotStart(dayStartMinutes);

  for (let pos = 1; pos < slotPosition; pos += 1) {
    currentSlotStartMinutes = findValidSlotStart(currentSlotStartMinutes + matchDurationMinutes);
  }

  if (currentSlotStartMinutes + matchDurationMinutes > dayEndMinutes) {
    return null;
  }

  return currentSlotStartMinutes;
}

function resolveNormalizedMatchEstimatedStartTimeScheduleDays(
  scheduleDays: unknown,
): MatchEstimatedStartTimeScheduleDay[] {
  if (!Array.isArray(scheduleDays)) {
    return [];
  }

  return scheduleDays
    .filter((scheduleDay): scheduleDay is Record<string, unknown> => {
      return typeof scheduleDay == "object" && scheduleDay != null;
    })
    .map((scheduleDay) => ({
      date: typeof scheduleDay.date == "string" ? scheduleDay.date : "",
      start_time: typeof scheduleDay.start_time == "string" ? scheduleDay.start_time : "",
      end_time: typeof scheduleDay.end_time == "string" ? scheduleDay.end_time : "",
    }))
    .filter((scheduleDay) => scheduleDay.date && scheduleDay.start_time && scheduleDay.end_time);
}

function resolveMatchEstimatedStartTimeScheduleDays(
  payloadSnapshot: Record<string, unknown> | null | undefined,
  fallbackScheduleDays: MatchEstimatedStartTimeScheduleDay[] | null | undefined,
): MatchEstimatedStartTimeScheduleDay[] {
  // Prefere dados ao vivo do banco (inclui array de breaks atualizado)
  const liveDays = (fallbackScheduleDays ?? []).filter(
    (d) => !!d.date && !!d.start_time && !!d.end_time,
  );
  if (liveDays.length > 0) {
    return liveDays;
  }

  // Fallback para payload_snapshot para campeonatos sem championship_bracket_days
  if (payloadSnapshot && typeof payloadSnapshot == "object") {
    return resolveNormalizedMatchEstimatedStartTimeScheduleDays(
      (payloadSnapshot as { schedule_days?: unknown }).schedule_days,
    );
  }

  return [];
}

function resolveTimeFormatterParts(dateTime: string): Map<string, string> | null {
  const resolvedDate = new Date(dateTime);

  if (Number.isNaN(resolvedDate.getTime())) {
    return null;
  }

  try {
    return new Map(
      MATCH_TIME_FORMATTER
        .formatToParts(resolvedDate)
        .filter((part) => part.type == "hour" || part.type == "minute")
        .map((part) => [part.type, part.value]),
    );
  } catch {
    return null;
  }
}

function resolveSaoPauloTimeLabel(dateTime: string): string | null {
  const timeParts = resolveTimeFormatterParts(dateTime);
  const hour = timeParts?.get("hour");
  const minute = timeParts?.get("minute");

  if (!hour || !minute) {
    return null;
  }

  return `${hour}:${minute}`;
}

function resolveSaoPauloDateLabel(dateTime: string): string | null {
  const resolvedDate = new Date(dateTime);

  if (Number.isNaN(resolvedDate.getTime())) {
    return null;
  }

  try {
    const dateParts = new Map(
      MATCH_DATE_FORMATTER
        .formatToParts(resolvedDate)
        .filter((part) => part.type == "year" || part.type == "month" || part.type == "day")
        .map((part) => [part.type, part.value]),
    );
    const year = dateParts.get("year");
    const month = dateParts.get("month");
    const day = dateParts.get("day");

    if (!year || !month || !day) {
      return null;
    }

    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

export function resolveSaoPauloDateTimeLabel(dateTime: string): string | null {
  const resolvedDateLabel = resolveSaoPauloDateLabel(dateTime);
  const resolvedTimeLabel = resolveSaoPauloTimeLabel(dateTime);

  if (!resolvedDateLabel || !resolvedTimeLabel) {
    return null;
  }

  return `${resolvedDateLabel} ${resolvedTimeLabel}`;
}

export function resolveEstimatedStartTimeByMatchId(params: {
  matches: Match[];
  contextMatches?: MatchRepresentationSource[];
  championshipSports: MatchEstimatedStartTimeChampionshipSport[];
  championshipBracketEditions: MatchEstimatedStartTimeBracketEdition[];
}): Record<string, string> {
  const {
    matches,
    contextMatches,
    championshipSports,
    championshipBracketEditions,
  } = params;

  if (matches.length == 0) {
    return {};
  }

  const operationalMatches = resolveUniqueMatchSourcesById([
    ...(contextMatches ?? []),
    ...matches,
  ]);

  const championshipSportByChampionshipAndSportKey = championshipSports.reduce<
    Record<string, MatchEstimatedStartTimeChampionshipSport>
  >((carry, championshipSport) => {
    carry[`${championshipSport.championship_id}:${championshipSport.sport_id}`] =
      championshipSport;
    return carry;
  }, {});

  const scheduleDayByChampionshipSeasonAndDateKey = championshipBracketEditions.reduce<
    Record<string, MatchEstimatedStartTimeScheduleDay>
  >((carry, championshipBracketEdition) => {
    const scheduleDays = resolveMatchEstimatedStartTimeScheduleDays(
      championshipBracketEdition.payload_snapshot,
      championshipBracketEdition.schedule_days,
    );

    scheduleDays.forEach((scheduleDay) => {
      carry[
        `${championshipBracketEdition.championship_id}:${championshipBracketEdition.season_year}:${scheduleDay.date}`
      ] = scheduleDay;
    });

    return carry;
  }, {});

  const estimatedStartTimeBySlotKey: Record<string, string> = {};
  const minimumRawSlotByChampionshipSeasonDateAndSportKey = operationalMatches.reduce<Record<string, number>>((carry, match) => {
    const scheduledDateValue = resolveMatchScheduledDateValue(match);

    if (!scheduledDateValue) {
      return carry;
    }

    const rawSlotPosition = Math.trunc(match.scheduled_slot ?? match.queue_position ?? Number.MAX_SAFE_INTEGER);

    if (!Number.isFinite(rawSlotPosition) || rawSlotPosition <= 0) {
      return carry;
    }

    const slotScopeKey = `${match.championship_id}:${match.season_year}:${scheduledDateValue}:${match.sport_id}`;
    const currentMinimumRawSlot = carry[slotScopeKey];

    if (
      !Number.isFinite(currentMinimumRawSlot) ||
      rawSlotPosition < currentMinimumRawSlot
    ) {
      carry[slotScopeKey] = rawSlotPosition;
    }

    return carry;
  }, {});

  return matches.reduce<Record<string, string>>((carry, match) => {
    if (match.status != MatchStatus.SCHEDULED) {
      return carry;
    }

    const championshipSport =
      championshipSportByChampionshipAndSportKey[
        `${match.championship_id}:${match.sport_id}`
      ];

    if (
      !championshipSport ||
      championshipSport.show_estimated_start_time_on_cards != true
    ) {
      return carry;
    }

    if (match.start_time) {
      const directPlannedStartTime = resolveSaoPauloTimeLabel(match.start_time);

      if (directPlannedStartTime && /^\d{2}:\d{2}$/.test(directPlannedStartTime)) {
        carry[match.id] = directPlannedStartTime;
        return carry;
      }
    }

    const matchDurationMinutes = Math.trunc(
      championshipSport.default_match_duration_minutes,
    );

    if (!Number.isFinite(matchDurationMinutes) || matchDurationMinutes <= 0) {
      return carry;
    }

    const scheduledDateValue = resolveMatchScheduledDateValue(match);

    if (!scheduledDateValue) {
      return carry;
    }

    const scheduleDay =
      scheduleDayByChampionshipSeasonAndDateKey[
        `${match.championship_id}:${match.season_year}:${scheduledDateValue}`
      ];

    if (!scheduleDay) {
      return carry;
    }

    const rawSlotPosition = Math.trunc(match.scheduled_slot ?? match.queue_position ?? Number.MAX_SAFE_INTEGER);

    if (!Number.isFinite(rawSlotPosition) || rawSlotPosition <= 0) {
      return carry;
    }

    const slotScopeKey = `${match.championship_id}:${match.season_year}:${scheduledDateValue}:${match.sport_id}`;
    const minimumRawSlotPosition = minimumRawSlotByChampionshipSeasonDateAndSportKey[slotScopeKey];

    if (!Number.isFinite(minimumRawSlotPosition) || minimumRawSlotPosition <= 0) {
      return carry;
    }

    const slotPosition = rawSlotPosition - minimumRawSlotPosition + 1;

    if (slotPosition <= 0) {
      return carry;
    }

    const dayStartMinutes = resolveTimeValueToMinutes(scheduleDay.start_time);
    const dayEndMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

    if (dayStartMinutes == null || dayEndMinutes == null || dayEndMinutes <= dayStartMinutes) {
      return carry;
    }

    const resolvedBreaks: Array<{ startMinutes: number; endMinutes: number }> = (scheduleDay.breaks ?? [])
      .map((brk) => ({
        startMinutes: resolveTimeValueToMinutes(brk.break_start_time) ?? -1,
        endMinutes: resolveTimeValueToMinutes(brk.break_end_time) ?? -1,
      }))
      .filter((brk) => brk.startMinutes >= 0 && brk.endMinutes > brk.startMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const breaksKey =
      resolvedBreaks.length > 0
        ? resolvedBreaks.map((b) => `${b.startMinutes}-${b.endMinutes}`).join("|")
        : "";

    const slotKey = [
      match.championship_id,
      String(match.season_year),
      scheduledDateValue,
      match.sport_id,
      String(slotPosition),
      String(matchDurationMinutes),
      scheduleDay.start_time,
      scheduleDay.end_time,
      breaksKey,
    ].join(":");

    if (!estimatedStartTimeBySlotKey[slotKey]) {
      const estimatedSlotStartMinutes = resolveEstimatedSlotStartMinutes({
        dayStartMinutes,
        dayEndMinutes,
        slotPosition,
        matchDurationMinutes,
        breaks: resolvedBreaks,
      });

      if (estimatedSlotStartMinutes == null) {
        return carry;
      }

      estimatedStartTimeBySlotKey[slotKey] = resolveMinutesToTimeLabel(
        estimatedSlotStartMinutes,
      );
    }

    carry[match.id] = estimatedStartTimeBySlotKey[slotKey];
    return carry;
  }, {});
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
    return match.scheduled_date.slice(0, 10);
  }

  if (match.start_time) {
    return resolveSaoPauloDateLabel(match.start_time);
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
  sports?: Match["sports"] | null;
}): string {
  const normalizedSportName = resolveNormalizedSportName(match.sports?.name);
  const competitionNaipeScope =
    normalizedSportName == NORMALIZED_BEACH_SOCCER_NAME
      ? "ALL_NAIPES"
      : match.naipe;

  return `${match.sport_id}:${competitionNaipeScope}:${match.division ?? "WITHOUT_DIVISION"}`;
}

export function resolveOrderedScheduledMatches<
  MatchItem extends {
    id: string;
    created_at: string;
    scheduled_date: string | null;
    start_time: string | null;
    queue_position: number | null;
    scheduled_slot?: number | null;
  },
>(scheduledMatches: MatchItem[]): MatchItem[] {
  return [...scheduledMatches].sort((firstMatch, secondMatch) => {
    const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
    const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

    if (firstScheduledDate != secondScheduledDate) {
      return firstScheduledDate.localeCompare(secondScheduledDate);
    }

    const slotDifference = resolveMatchDisplaySlotValue(firstMatch) - resolveMatchDisplaySlotValue(secondMatch);

    if (slotDifference != 0) {
      return slotDifference;
    }

    if (firstMatch.created_at != secondMatch.created_at) {
      return firstMatch.created_at.localeCompare(secondMatch.created_at);
    }

    return firstMatch.id.localeCompare(secondMatch.id);
  });
}

export function resolveNextScheduledMatchesByCompetition<
  MatchItem extends {
    sport_id: string;
    naipe: MatchNaipe;
    division: TeamDivision | null | undefined;
    sports?: Match["sports"] | null;
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
    sports?: Match["sports"] | null;
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

export function resolveMatchStartedAtLabel(
  startTime: string | null,
  matchStatus?: MatchStatus | null,
): string | null {
  if (!startTime || matchStatus == MatchStatus.SCHEDULED) {
    return null;
  }

  return `Jogo iniciado às ${resolveSaoPauloTimeLabel(startTime) ?? format(new Date(startTime), "HH:mm", { locale: ptBR })}`;
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
      homeTeamName,
      awayTeamName,
      homePoints: matchSet.home_points,
      awayPoints: matchSet.away_points,
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
      const groupStageLabel = `${competition.sport_name} • ${MATCH_NAIPE_LABELS[competition.naipe]} • ${divisionLabel}${seasonYearLabel} • ${championshipGroupLabel}`;
      const groupLabel = championshipGroupLabel;
      const groupFilterValue = championshipGroupLabel;
      const badgeLabel = championshipGroupLabel;

      group.matches.forEach((groupMatch) => {
        if (!groupMatch.match_id) {
          return;
        }

        matchContextById[groupMatch.match_id] = {
          badgeLabel,
          phase: BracketPhase.GROUP_STAGE,
          seasonYear,
          stageLabel: groupStageLabel,
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
        label: resolveChampionshipGroupLabel(group.group_number),
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
